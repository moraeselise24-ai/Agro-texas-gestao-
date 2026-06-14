import { chromium, type Locator, type Page } from 'playwright'
import type { ServiceOrderDraft } from '../types.js'
import {
  listQueuedServiceOrderDrafts,
  markServiceOrderCreated,
  markServiceOrderError,
  markServiceOrderProcessing,
} from '../repositories/serviceOrdersRepo.js'

type ServiceOrderBotConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  osUrl: string
  embarksUrl: string
  destinationsUrl: string
}

type ProcessQueueResult = {
  processed: number
  created: number
  failed: number
  items: Array<{ id: string; referenceCode: string; status: string; classificOsId: string | null; error: string | null }>
}

let queueInFlight = false

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : undefined
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '')

const loadConfig = (): ServiceOrderBotConfig | null => {
  const baseUrl = normalizeBaseUrl(getEnv('CLASSIFIC_URL') ?? getEnv('CLASSIFIC_BASE_URL') ?? 'https://sistema.classific.com.br')
  const username = getEnv('CLASSIFIC_USERNAME')
  const password = getEnv('CLASSIFIC_PASSWORD')
  if (!username || !password) return null

  return {
    baseUrl,
    username,
    password,
    userSelector:
      getEnv('CLASSIFIC_LOGIN_USER_SELECTOR') ??
      'input[placeholder="Email"], input[placeholder*="Email" i], input[name="email"], input[type="email"], input[name="login"], input[name="usuario"], input[name="user"], input[name="username"], input[type="text"]',
    passSelector:
      getEnv('CLASSIFIC_LOGIN_PASS_SELECTOR') ??
      'input[placeholder="Senha"], input[placeholder*="Senha" i], input[name="password"], input[type="password"]',
    submitSelector:
      getEnv('CLASSIFIC_LOGIN_SUBMIT_SELECTOR') ??
      'button[type="submit"], input[type="submit"], button:has-text("Entrar"), input[value*="Entrar"]',
    osUrl: getEnv('CLASSIFIC_OS_LIST_URL') ?? `${baseUrl}/os`,
    embarksUrl: getEnv('CLASSIFIC_EMBARQUES_URL') ?? `${baseUrl}/embarques`,
    destinationsUrl: getEnv('CLASSIFIC_DESTINOS_URL') ?? `${baseUrl}/destinos`,
  }
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const stateNamesByCode = new Map(
  Object.entries({
    AC: 'Acre',
    AL: 'Alagoas',
    AP: 'Amapá',
    AM: 'Amazonas',
    BA: 'Bahia',
    CE: 'Ceará',
    DF: 'Distrito Federal',
    ES: 'Espírito Santo',
    GO: 'Goiás',
    MA: 'Maranhão',
    MT: 'Mato Grosso',
    MS: 'Mato Grosso do Sul',
    MG: 'Minas Gerais',
    PA: 'Pará',
    PB: 'Paraíba',
    PR: 'Paraná',
    PE: 'Pernambuco',
    PI: 'Piauí',
    RJ: 'Rio de Janeiro',
    RN: 'Rio Grande do Norte',
    RS: 'Rio Grande do Sul',
    RO: 'Rondônia',
    RR: 'Roraima',
    SC: 'Santa Catarina',
    SP: 'São Paulo',
    SE: 'Sergipe',
    TO: 'Tocantins',
  }),
)

const stateNameFromValue = (value: string): string => {
  const clean = value.trim()
  return stateNamesByCode.get(clean.toUpperCase()) ?? clean
}

const firstVisible = async (locators: Locator[]): Promise<Locator | null> => {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0)
    if (!count) continue
    const first = locator.first()
    if (await first.isVisible().catch(() => false)) return first
  }
  return null
}

const fieldContext = async (locator: Locator): Promise<string> =>
  locator.evaluate((node) => {
    const control = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const id = control.getAttribute('id') ?? ''
    const explicitLabel = id ? (document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? '') : ''
    return [
      control.getAttribute('name'),
      control.getAttribute('id'),
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      explicitLabel,
    ]
      .filter(Boolean)
      .join(' ')
  })

const visibleField = async (page: Page, patterns: RegExp[], selector = 'input, select, textarea'): Promise<Locator | null> => {
  const byLabel = await firstVisible(patterns.map((pattern) => page.getByLabel(pattern)))
  if (byLabel) return byLabel

  const controls = page.locator(selector)
  const count = await controls.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    if (!(await control.isVisible().catch(() => false))) continue
    const context = await fieldContext(control).catch(() => '')
    if (patterns.some((pattern) => pattern.test(context))) return control
  }

  return null
}

const fillByLabel = async (page: Page, patterns: RegExp[], value: string): Promise<void> => {
  const locator = await visibleField(page, patterns, 'input, textarea')
  if (!locator) throw new Error(`Campo não encontrado: ${patterns[0]}`)
  await locator.fill(value)
}

const selectByLabel = async (page: Page, patterns: RegExp[], value: string): Promise<void> => {
  const locator = await visibleField(page, patterns, 'select')
  if (!locator) throw new Error(`Select não encontrado: ${patterns[0]}`)

  const wanted = normalize(value)
  const options = await locator.locator('option').evaluateAll((nodes) =>
    nodes.map((node) => ({
      value: (node as HTMLOptionElement).value,
      label: ((node.textContent ?? '') || (node as HTMLOptionElement).label).trim(),
    })),
  )
  const found =
    options.find((option) => normalize(option.label) === wanted || normalize(option.value) === wanted) ??
    options.find((option) => normalize(option.label).includes(wanted) || wanted.includes(normalize(option.label)))

  if (!found) throw new Error(`Opção não encontrada para "${value}"`)
  await locator.selectOption(found.value)
}

const clickByText = async (page: Page, patterns: RegExp[]): Promise<void> => {
  const locator = await firstVisible(patterns.map((pattern) => page.getByRole('button', { name: pattern })))
  if (locator) {
    await locator.click()
    return
  }

  const link = await firstVisible(patterns.map((pattern) => page.getByRole('link', { name: pattern })))
  if (link) {
    await link.click()
    return
  }

  for (const pattern of patterns) {
    const controls = page
      .locator('a, button, [role="button"], input[type="button"], input[type="submit"]')
      .filter({ hasText: pattern })
    const control = await firstVisible([controls])
    if (control) {
      await control.click()
      return
    }

    const inputs = await page.locator('input[type="button"], input[type="submit"]').elementHandles()
    for (const input of inputs) {
      const value = await input.getAttribute('value').catch(() => null)
      if (value && pattern.test(value)) {
        await input.click()
        return
      }
    }

    const visibleText = await firstVisible([page.getByText(pattern).first()])
    if (visibleText) {
      await visibleText.click()
      return
    }
  }

  const actions = await page
    .locator('a, button, [role="button"], input[type="button"], input[type="submit"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ((node.textContent ?? '') || (node as HTMLInputElement).value || node.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .slice(0, 12),
    )
    .catch(() => [] as string[])
  throw new Error(`Botão não encontrado: ${patterns[0]}. URL atual: ${page.url()}. Ações visíveis: ${actions.join(', ') || '-'}`)
}

const hasVisibleLabeledFields = async (page: Page, patterns: RegExp[]): Promise<boolean> => {
  for (const pattern of patterns) {
    const locator = await visibleField(page, [pattern])
    if (!locator) return false
  }
  return true
}

const createUrlCandidates = (listUrl: string): string[] => {
  const base = listUrl.split('?')[0].replace(/\/+$/, '')
  return ['/novo', '/nova', '/new', '/create', '/registrar', '/cadastrar', '/adicionar'].map((suffix) => `${base}${suffix}`)
}

const visiblePasswordInput = async (page: Page, cfg: ServiceOrderBotConfig): Promise<Locator | null> =>
  firstVisible([page.locator(cfg.passSelector), page.locator('input[type="password"]')])

const visibleUserInput = async (page: Page, cfg: ServiceOrderBotConfig): Promise<Locator | null> =>
  firstVisible([
    page.locator(cfg.userSelector),
    page.getByPlaceholder(/email|e-?mail/i),
    page.getByLabel(/e-?mail|login|usu[aá]rio/i),
    page.locator('input[type="email"]'),
    page.locator(
      'input[name*="email"], input[name*="login"], input[name*="usuario"], input[name*="user"], input[name*="username"]',
    ),
    page.locator(
      'input[placeholder*="email" i], input[placeholder*="e-mail" i], input[placeholder*="login" i], input[placeholder*="usuário" i], input[placeholder*="usuario" i]',
    ),
    page.locator('input[type="text"]:not([name*="password" i])'),
  ])

const isLoginScreen = async (page: Page, cfg: ServiceOrderBotConfig): Promise<boolean> => {
  if (await visiblePasswordInput(page, cfg)) return true
  const actions = await page
    .locator('a, button, [role="button"], input[type="button"], input[type="submit"]')
    .allTextContents()
    .catch(() => [] as string[])
  const joined = normalize(actions.join(' '))
  return joined.includes('entrar') && (joined.includes('criar conta') || joined.includes('esqueceu sua senha'))
}

const writeInput = async (locator: Locator, value: string): Promise<void> => {
  await locator.click({ clickCount: 3 })
  await locator.fill('')
  await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined)
  await locator.type(value, { delay: 20 })
}

const waitForLoginResult = async (page: Page, cfg: ServiceOrderBotConfig): Promise<boolean> => {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page
    .waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 12000 })
    .catch(() => undefined)
  await page.waitForTimeout(800)
  return !(await isLoginScreen(page, cfg))
}

const loginScreenMessage = async (page: Page): Promise<string> => {
  const text = await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/senha|password/i.test(line))
    .slice(0, 8)
    .join(' | ')
}

const loginIfNeeded = async (page: Page, cfg: ServiceOrderBotConfig): Promise<boolean> => {
  await page.waitForTimeout(700)
  const passwordInput = await visiblePasswordInput(page, cfg)
  if (!passwordInput) return false

  const userInput = await visibleUserInput(page, cfg)
  if (!userInput) throw new Error(`Tela de login detectada, mas campo de usuário não encontrado. URL atual: ${page.url()}`)

  await writeInput(userInput, cfg.username)
  await writeInput(passwordInput, cfg.password)

  const submit = await firstVisible([
    page.locator(cfg.submitSelector),
    page.getByRole('button', { name: /entrar|login|acessar/i }),
    page.getByRole('link', { name: /entrar|login|acessar/i }),
  ])
  if (!submit) throw new Error(`Tela de login detectada, mas botão Entrar não encontrado. URL atual: ${page.url()}`)

  await submit.click()
  if (!(await waitForLoginResult(page, cfg))) {
    const retryPassword = await visiblePasswordInput(page, cfg)
    const retryUser = await visibleUserInput(page, cfg)
    if (retryUser && retryPassword) {
      await writeInput(retryUser, cfg.username)
      await writeInput(retryPassword, cfg.password)
      await retryPassword.press('Enter')
      if (await waitForLoginResult(page, cfg)) return true
    }
  }
  if (await isLoginScreen(page, cfg)) {
    const finalPassword = await visiblePasswordInput(page, cfg)
    if (finalPassword) {
      await finalPassword.press('Enter')
      if (await waitForLoginResult(page, cfg)) return true
    }
  }
  if (await isLoginScreen(page, cfg)) {
    const message = await loginScreenMessage(page)
    throw new Error(
      `Login do Classific não autenticou. Confira CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD nos secrets do Fly. Tela: ${message || page.url()}`,
    )
  }
  return true
}

const gotoAuthenticated = async (page: Page, cfg: ServiceOrderBotConfig, url: string): Promise<void> => {
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  const loggedIn = await loginIfNeeded(page, cfg)
  if (loggedIn && !normalize(page.url()).includes(normalize(url))) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
    await loginIfNeeded(page, cfg)
  }
  if (await isLoginScreen(page, cfg)) {
    throw new Error('Classific abriu a tela de login em vez da página protegida. Confira os secrets CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD no Fly.')
  }
}

const openCreateForm = async (
  page: Page,
  cfg: ServiceOrderBotConfig,
  listUrl: string,
  requiredFields: RegExp[],
  createButtons: RegExp[],
): Promise<void> => {
  const openAndCheck = async (url: string): Promise<boolean> => {
    await gotoAuthenticated(page, cfg, url)
    return hasVisibleLabeledFields(page, requiredFields)
  }

  if (await openAndCheck(listUrl)) return

  for (const candidate of createUrlCandidates(listUrl)) {
    if (await openAndCheck(candidate)) return
  }

  await gotoAuthenticated(page, cfg, listUrl)
  await clickByText(page, createButtons)
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await loginIfNeeded(page, cfg)
  if (await hasVisibleLabeledFields(page, requiredFields)) return

  throw new Error(`Formulário de cadastro não abriu. URL atual: ${page.url()}`)
}

const login = async (page: Page, cfg: ServiceOrderBotConfig): Promise<void> => {
  await gotoAuthenticated(page, cfg, cfg.baseUrl)
}

const hasTableText = async (page: Page, value: string): Promise<boolean> => {
  const wanted = normalize(value)
  const texts = await page.locator('table tbody tr').allTextContents().catch(() => [] as string[])
  return texts.some((text) => normalize(text).includes(wanted))
}

const ensurePlace = async (
  page: Page,
  cfg: ServiceOrderBotConfig,
  url: string,
  name: string,
  municipio: string | null,
  uf: string | null,
): Promise<void> => {
  await gotoAuthenticated(page, cfg, url)
  if (await hasTableText(page, name)) return

  if (!municipio || !uf) throw new Error(`Município/UF ausente para cadastrar "${name}"`)
  await openCreateForm(page, cfg, url, [/nome/i, /munic[ií]pio/i, /estado|uf/i], [/novo\s*\+/i, /nova\s*\+/i, /novo/i, /nova/i, /\+/])
  await fillByLabel(page, [/nome/i], name)
  await fillByLabel(page, [/munic[ií]pio/i], municipio)
  await selectByLabel(page, [/estado|uf/i], stateNameFromValue(uf))
  await clickByText(page, [/salvar/i])
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
}

const createServiceOrder = async (page: Page, cfg: ServiceOrderBotConfig, order: ServiceOrderDraft): Promise<string | null> => {
  if (order.embarkPointNeedsCreate || (order.embarkPointMunicipio && order.embarkPointUf)) {
    await ensurePlace(page, cfg, cfg.embarksUrl, order.embarkPoint, order.embarkPointMunicipio, order.embarkPointUf)
  }
  if (order.destinationNeedsCreate || (order.destinationMunicipio && order.destinationUf)) {
    await ensurePlace(page, cfg, cfg.destinationsUrl, order.destination, order.destinationMunicipio, order.destinationUf)
  }

  await openCreateForm(
    page,
    cfg,
    cfg.osUrl,
    [/cliente/i, /embarque|ponto/i, /destino/i, /produto/i, /lote/i, /classificador/i],
    [/nova\s*\+/i, /novo\s*\+/i, /nova/i, /novo/i, /\+/],
  )

  await selectByLabel(page, [/cliente/i], order.clientName)
  await selectByLabel(page, [/embarque|ponto/i], order.embarkPoint)
  await selectByLabel(page, [/destino/i], order.destination)
  await selectByLabel(page, [/produto/i], order.product)
  if (order.contractNumber) await fillByLabel(page, [/contrato/i], order.contractNumber)
  await fillByLabel(page, [/lote/i], String(Math.round(order.lotKg)))
  if (order.producerName) await fillByLabel(page, [/produtor/i], order.producerName)
  if (order.classifierName) await selectByLabel(page, [/classificador/i], order.classifierName)

  await clickByText(page, [/salvar/i])
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)

  const urlMatch = page.url().match(/\/os\/([^/]+)/i)
  if (urlMatch?.[1] && !/novo|create|registrar/i.test(urlMatch[1])) return urlMatch[1]

  return null
}

export const processServiceOrderQueue = async (limit = 3): Promise<ProcessQueueResult> => {
  if (queueInFlight) throw new Error('Fila de O.S. já está em processamento')
  const cfg = loadConfig()
  if (!cfg) throw new Error('Classific não configurado: informe CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD')

  queueInFlight = true
  const result: ProcessQueueResult = { processed: 0, created: 0, failed: 0, items: [] }
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  try {
    await login(page, cfg)
    const queued = await listQueuedServiceOrderDrafts(limit)

    for (const queuedOrder of queued) {
      result.processed += 1
      const order = await markServiceOrderProcessing(queuedOrder.id)
      try {
        const classificOsId = await createServiceOrder(page, cfg, order)
        const updated = await markServiceOrderCreated(order.id, classificOsId)
        result.created += 1
        result.items.push({
          id: updated.id,
          referenceCode: updated.referenceCode,
          status: updated.status,
          classificOsId: updated.classificOsId,
          error: null,
        })
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao criar O.S. no Classific'
        const updated = await markServiceOrderError(order.id, message)
        result.failed += 1
        result.items.push({
          id: updated.id,
          referenceCode: updated.referenceCode,
          status: updated.status,
          classificOsId: updated.classificOsId,
          error: updated.botError,
        })
      }
    }
  } finally {
    queueInFlight = false
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }

  return result
}
