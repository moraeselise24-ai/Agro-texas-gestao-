import { chromium, type Locator, type Page } from 'playwright'

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : undefined
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '')
const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const compact = (value: string): string => normalize(value).replace(/[^a-z0-9]/g, '')
const navigationTimeoutMs = 90000
const settleTimeoutMs = 45000

type LaudoConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  laudosUrl: string
}

export type ClassificLaudoPayload = {
  osId: string
  detailId?: string | null
  classifierName: string
  data: string
  placa: string
  peso: string
  transportadora?: string
  teste?: string
  insetosVivos?: boolean
  insetosMortos?: boolean
  odor?: boolean
  toxicidade?: boolean
  ardidosQueimados?: string
  umidade?: string
  queimados?: string
  impurezas?: string
  mofados?: string
  esverdeados?: string
  fermentados?: string
  quebrados?: string
  germinados?: string
  chochos?: string
  danificados?: string
  imaturos?: string
  observacoes?: string
}

const loadConfig = (): LaudoConfig | null => {
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
    laudosUrl: getEnv('CLASSIFIC_LAUDOS_URL') ?? `${baseUrl}/laudos`,
  }
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
    const scopedLabel =
      control.closest('.form-group, .field, .input-group, .form-floating, .mb-3, .col, .col-md-4, .col-md-6')?.querySelector('label')
        ?.textContent ?? ''
    return [
      control.getAttribute('name'),
      control.getAttribute('id'),
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      explicitLabel,
      scopedLabel,
    ]
      .filter(Boolean)
      .join(' ')
  })

const visibleField = async (
  page: Page,
  patterns: RegExp[],
  selector = 'input, select, textarea',
  blockedNames: string[] = [],
): Promise<Locator | null> => {
  const byLabel = await firstVisible(patterns.map((pattern) => page.getByLabel(pattern)))
  if (byLabel) {
    const name = (await byLabel.getAttribute('name').catch(() => null)) ?? ''
    if (!blockedNames.includes(name)) return byLabel
  }

  const controls = page.locator(selector)
  const count = await controls.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    if (!(await control.isVisible().catch(() => false))) continue
    const name = (await control.getAttribute('name').catch(() => null)) ?? ''
    if (blockedNames.includes(name)) continue
    const context = normalize(await fieldContext(control).catch(() => ''))
    if (patterns.some((pattern) => pattern.test(context))) return control
  }
  return null
}

const writeInput = async (locator: Locator, value: string): Promise<void> => {
  await locator.fill(value).catch(async () => {
    await locator.click({ clickCount: 3 })
    await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined)
    await locator.type(value, { delay: 12 })
  })
}

const visiblePasswordInput = async (page: Page, cfg: LaudoConfig): Promise<Locator | null> =>
  firstVisible([page.locator(cfg.passSelector), page.locator('input[type="password"]')])

const visibleUserInput = async (page: Page, cfg: LaudoConfig): Promise<Locator | null> =>
  firstVisible([
    page.locator(cfg.userSelector),
    page.getByPlaceholder(/email|e-?mail/i),
    page.getByLabel(/e-?mail|login|usu[aá]rio/i),
    page.locator('input[type="email"]'),
    page.locator('input[name*="email"], input[name*="login"], input[name*="usuario"], input[name*="user"], input[name*="username"]'),
    page.locator('input[type="text"]:not([name*="password" i])'),
  ])

const loginIfNeeded = async (page: Page, cfg: LaudoConfig): Promise<void> => {
  await page.waitForTimeout(500)
  const passwordInput = await visiblePasswordInput(page, cfg)
  if (!passwordInput) return

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
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 12000 }).catch(() => undefined)
  if (await visiblePasswordInput(page, cfg)) throw new Error('Login do Classific não autenticou. Confira usuário e senha nos secrets do Fly.')
}

const gotoWithRetry = async (page: Page, url: string, label: string): Promise<void> => {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeoutMs })
      await page.waitForLoadState('networkidle', { timeout: settleTimeoutMs }).catch(() => undefined)
      return
    } catch (error) {
      lastError = error
      await page.waitForTimeout(1200 * attempt).catch(() => undefined)
    }
  }
  throw new Error(`${label}: Classific demorou para abrir ${url}. Último erro: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

const gotoAuthenticated = async (page: Page, cfg: LaudoConfig, url: string): Promise<void> => {
  await gotoWithRetry(page, url, 'Navegação autenticada')
  const beforeLoginUrl = page.url()
  await loginIfNeeded(page, cfg)
  if (page.url() !== beforeLoginUrl || !page.url().startsWith(url)) {
    await gotoWithRetry(page, url, 'Retorno após login')
  }
}

const optionTokens = (value: string): string[] => {
  const stopWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return normalize(value).split(' ').filter((token) => token && !stopWords.has(token))
}

const chooseNamedSelectOption = async (page: Page, name: string, wanted: string, description: string): Promise<void> => {
  const field = page.locator(`select[name="${name}"]`).first()
  if (!(await field.isVisible().catch(() => false))) {
    throw new Error(`Select ${name} não encontrado para ${description}.`)
  }

  const wantedRaw = String(wanted).trim()
  const wantedText = normalize(wantedRaw)
  const wantedTokens = optionTokens(wantedRaw)
  const options = field.locator('option')
  const count = await options.count().catch(() => 0)
  const sample: string[] = []
  const scored: Array<{ value: string; label: string; score: number }> = []

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    const label = (await option.textContent().catch(() => ''))?.trim() ?? ''
    const value = (await option.getAttribute('value').catch(() => null)) ?? ''
    if (label && sample.length < 12) sample.push(label)
    if (!value) continue
    const optionText = normalize(label)
    const labelTokens = optionTokens(label)
    let score = 0
    if (value === wantedRaw) score = 110
    else if (optionText === wantedText) score = 100
    else if (optionText.includes(wantedText) || wantedText.includes(optionText)) score = 90
    else if (wantedTokens.length >= 2 && wantedTokens.every((token) => labelTokens.includes(token))) score = 80
    else score = wantedTokens.filter((token) => labelTokens.includes(token)).length
    if (score >= 2) scored.push({ value, label, score })
  }

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (!best) {
    const sampleText = sample.length ? ` Opções de ${name}: ${sample.join(', ')}` : ''
    throw new Error(`${description} não encontrado no select ${name}: ${wanted}.${sampleText}`)
  }

  await field.selectOption(best.value)
}

const chooseSelectOption = async (field: Locator, wanted: string, description: string): Promise<void> => {
  const wantedText = normalize(wanted)
  const wantedRaw = String(wanted).trim()
  const wantedTokens = optionTokens(wanted)
  const options = field.locator('option')
  const count = await options.count().catch(() => 0)
  const scored: Array<{ value: string; label: string; score: number }> = []
  const sample: string[] = []

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    const label = (await option.textContent().catch(() => ''))?.trim() ?? ''
    const value = (await option.getAttribute('value').catch(() => null)) ?? ''
    if (label && sample.length < 10) sample.push(label)
    if (!value) continue
    const optionText = normalize(label)
    const tokens = optionTokens(label)
    let score = 0
    if (value === wantedRaw) score = 110
    else if (optionText === wantedText) score = 100
    else if (optionText.includes(wantedText) || wantedText.includes(optionText)) score = 90
    else if (wantedTokens.length >= 2 && wantedTokens.every((token) => tokens.includes(token))) score = 80
    else score = wantedTokens.filter((token) => tokens.includes(token)).length
    if (score > 0) scored.push({ value, label, score })
  }

  scored.sort((a, b) => b.score - a.score)
  const best = scored.find((item) => item.score >= 2)
  if (!best) throw new Error(`${description} não encontrado no select: ${wanted}. Opções: ${sample.join(', ')}`)
  await field.selectOption(best.value)
}

const selectOrType = async (page: Page, field: Locator, wanted: string, description: string): Promise<void> => {
  const tag = await field.evaluate((node) => node.tagName.toLowerCase())
  if (tag === 'select') {
    await chooseSelectOption(field, wanted, description)
    return
  }
  await writeInput(field, wanted)
  await page.keyboard.press('ArrowDown').catch(() => undefined)
  await page.keyboard.press('Enter').catch(() => undefined)
}

const setField = async (page: Page, patterns: RegExp[], value?: string, selector = 'input, textarea'): Promise<void> => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return
  const field = await visibleField(page, patterns, selector)
  if (!field) return
  await writeInput(field, trimmed)
}

const setRequiredPercent = async (page: Page, patterns: RegExp[], value?: string): Promise<void> => {
  await setField(page, patterns, String(value ?? '').trim() || '0')
}

const setSelect = async (page: Page, patterns: RegExp[], value?: string): Promise<void> => {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return
  const field = await visibleField(page, patterns, 'select, input', ['os_id', 'classificador_id'])
  if (!field) return
  await selectOrType(page, field, trimmed, trimmed)
}

const yesNo = (value?: boolean): string | undefined => {
  if (value == null) return undefined
  return value ? 'Sim' : 'Não'
}

const clickSubmit = async (page: Page): Promise<void> => {
  const save = await firstVisible([
    page.getByRole('button', { name: /salvar|registrar|gravar|finalizar/i }),
    page.locator('button[type="submit"], input[type="submit"]'),
  ])
  if (!save) throw new Error('Botão Salvar não encontrado no laudo.')
  await save.click()
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined)
  await page.waitForTimeout(1200)
}

const clickSaveAndWaitCms = async (page: Page, description: string): Promise<void> => {
  const save = await firstVisible([
    page.getByRole('button', { name: /salvar|registrar|gravar|finalizar/i }),
    page.locator('button[type="submit"], input[type="submit"]'),
  ])
  if (!save) throw new Error(`Botão Salvar não encontrado no laudo (${description}).`)

  const responsePromise = page
    .waitForResponse((response) => response.url().includes('/cms/laudos') || response.url().includes('/laudos'), { timeout: 15000 })
    .catch(() => null)

  await save.click()
  const response = await responsePromise
  if (response && response.status() >= 400) {
    throw new Error(`Classific recusou o salvamento do laudo (${description}). HTTP ${response.status()} em ${response.url()}`)
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined)
  await page.waitForTimeout(1200)
}

const visibleSecondStep = async (page: Page): Promise<boolean> => {
  const field = await visibleField(page, [/teste|umidade|ardidos/i], 'select, input, textarea', ['os_id', 'classificador_id'])
  return Boolean(field)
}

const waitForSecondStep = async (page: Page): Promise<boolean> => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (await visibleSecondStep(page)) return true
    await page.waitForTimeout(500)
  }
  return false
}

const currentPageSummary = async (page: Page): Promise<string> => {
  const text = await page.locator('body').innerText({ timeout: 2500 }).catch(() => '')
  return text.replace(/\s+/g, ' ').trim().slice(0, 600)
}

const findSavedLaudoId = async (page: Page, osId: string, placa: string): Promise<string | null> => {
  const rows = page.locator('table tbody tr')
  const count = await rows.count().catch(() => 0)
  const wantedOs = compact(osId)
  const wantedPlate = compact(placa)

  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const text = compact(await row.innerText().catch(() => ''))
    if (wantedOs && !text.includes(wantedOs)) continue
    if (wantedPlate && !text.includes(wantedPlate)) continue
    const cells = await row.locator('td').evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? '')).catch(() => [])
    const number = cells.find((cell) => /^\d{6,}$/.test(cell.replace(/\D/g, '')))?.replace(/\D/g, '')
    if (number) return number
  }

  return null
}

const waitForLaudoSaved = async (page: Page, cfg: LaudoConfig, osId: string, placa: string): Promise<string | null> => {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => undefined)
  await page.waitForTimeout(1500)

  const stillOnSecondStep = await visibleSecondStep(page)
  if (stillOnSecondStep) {
    throw new Error(`Classific não confirmou o laudo após salvar. URL: ${page.url()}`)
  }

  await gotoWithRetry(page, cfg.laudosUrl, 'Busca do laudo salvo')
  await page.waitForTimeout(1500)

  const rowsText = normalize(await page.locator('table tbody').innerText({ timeout: 5000 }).catch(() => ''))
  const wantedOs = normalize(osId)
  const wantedPlate = normalize(placa)
  if (!rowsText.includes(wantedOs) && !rowsText.includes(wantedPlate)) {
    throw new Error(`Laudo enviado, mas não apareceu na listagem do Classific. Confira filtros/status. O.S.: ${osId}, placa: ${placa}`)
  }
  return findSavedLaudoId(page, osId, placa)
}

const openNewLaudo = async (page: Page, cfg: LaudoConfig): Promise<void> => {
  await gotoAuthenticated(page, cfg, cfg.laudosUrl)

  if (await page.locator('select[name="os_id"]').first().isVisible().catch(() => false)) return

  const button = await firstVisible([
    page.locator('button[onclick*="Insert"], a[onclick*="Insert"]'),
    page.locator('button.btn-success:has-text("Novo"), a.btn-success:has-text("Novo")'),
    page.getByRole('button', { name: /novo/i }),
    page.getByRole('link', { name: /novo/i }),
    page.locator('button:has-text("Novo"), a:has-text("Novo")'),
  ])

  if (button) {
    await button.scrollIntoViewIfNeeded().catch(() => undefined)
    await button.click({ force: true }).catch(async () => {
      await page.evaluate('typeof Insert === \"function\" && Insert()')
    })
  } else {
    const inserted = await page
      .evaluate('typeof Insert === \"function\" ? (Insert(), true) : false')
      .catch(() => false)
    if (!inserted) throw new Error('Botão Novo + não encontrado em Laudos.')
  }

  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForSelector('select[name="os_id"]', { timeout: 10000 }).catch(() => undefined)
  await page.waitForTimeout(800)
}

export const createClassificLaudo = async (
  args: ClassificLaudoPayload,
): Promise<{ osId: string; classifierName: string; laudoId: string | null; url: string }> => {
  const cfg = loadConfig()
  if (!cfg) throw new Error('Classific não configurado: informe CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD')

  const osId = String(args.osId ?? '').trim()
  const classifierName = String(args.classifierName ?? '').trim()
  const data = String(args.data ?? '').trim()
  const placa = String(args.placa ?? '').trim()
  const peso = String(args.peso ?? '').trim()
  if (!osId) throw new Error('Informe a O.S.')
  if (!classifierName) throw new Error('Informe o classificador')
  if (!data || !placa || !peso) throw new Error('Informe data, placa e peso.')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(45000)
  page.setDefaultNavigationTimeout(navigationTimeoutMs)

  try {
    await openNewLaudo(page, cfg)

    await chooseNamedSelectOption(page, 'os_id', args.detailId || osId, 'O.S.')
    await chooseNamedSelectOption(page, 'classificador_id', classifierName, 'Classificador')

    await setField(page, [/data/i], data, 'input')
    await setField(page, [/placa/i], placa, 'input')
    await setField(page, [/peso/i], peso, 'input')
    await setField(page, [/transportadora/i], args.transportadora, 'input')

    await clickSaveAndWaitCms(page, 'dados iniciais')

    if (!(await waitForSecondStep(page))) {
      throw new Error(`Classific não abriu a etapa de Classificação e Teste. URL: ${page.url()}. Tela: ${await currentPageSummary(page)}`)
    }

    await setSelect(page, [/teste/i], args.teste || 'Convencional')
    await setSelect(page, [/insetos vivos/i], yesNo(args.insetosVivos))
    await setSelect(page, [/insetos mortos/i], yesNo(args.insetosMortos))
    await setSelect(page, [/odor/i], yesNo(args.odor))
    await setSelect(page, [/toxicidade/i], yesNo(args.toxicidade))
    await setRequiredPercent(page, [/ardidos.*queimados/i], args.ardidosQueimados)
    await setRequiredPercent(page, [/umidade/i], args.umidade)
    await setRequiredPercent(page, [/^queimados|queimados/i], args.queimados)
    await setRequiredPercent(page, [/mat.*estranhas|impurezas/i], args.impurezas)
    await setRequiredPercent(page, [/mofados/i], args.mofados)
    await setRequiredPercent(page, [/esverdeados/i], args.esverdeados)
    await setRequiredPercent(page, [/fermentados/i], args.fermentados)
    await setRequiredPercent(page, [/partido|quebrado|amassado/i], args.quebrados)
    await setRequiredPercent(page, [/germinados/i], args.germinados)
    await setRequiredPercent(page, [/chochos/i], args.chochos)
    await setRequiredPercent(page, [/danificados/i], args.danificados)
    await setRequiredPercent(page, [/imaturos/i], args.imaturos)
    await setField(page, [/observa/i], args.observacoes, 'textarea, input')

    await clickSaveAndWaitCms(page, 'classificação e teste')
    const laudoId = await waitForLaudoSaved(page, cfg, osId, placa)

    return { osId, classifierName, laudoId, url: page.url() }
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
