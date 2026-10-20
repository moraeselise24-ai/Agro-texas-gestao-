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

const applyTemplate = (template: string, id: string): string =>
  template.replace(/\{id\}/g, encodeURIComponent(id)).replace(/\{osId\}/g, encodeURIComponent(id))

type DistributionConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  osListUrl: string
  detailUrlTemplate: string
  editUrlTemplate: string
}

const loadConfig = (): DistributionConfig | null => {
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
    osListUrl: getEnv('CLASSIFIC_OS_LIST_URL') ?? `${baseUrl}/os`,
    detailUrlTemplate: getEnv('CLASSIFIC_OS_DETALHAR_URL_TEMPLATE') ?? `${baseUrl}/os/{id}/detalhar`,
    editUrlTemplate: getEnv('CLASSIFIC_OS_ALTERAR_URL_TEMPLATE') ?? `${baseUrl}/os/{id}/alterar`,
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
    const parent = control.closest('.form-group, .field, .input-group, div')?.textContent ?? ''
    return [
      control.getAttribute('name'),
      control.getAttribute('id'),
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      explicitLabel,
      parent,
    ]
      .filter(Boolean)
      .join(' ')
  })

const classifierField = async (page: Page): Promise<Locator | null> =>
  firstVisible([
    page.locator('select[name="classificador_id"]'),
    page.locator('select[name*="classificador" i]'),
    page.locator('input[name*="classificador" i]'),
    page.locator('textarea[name*="classificador" i]'),
  ])

const visibleField = async (page: Page, patterns: RegExp[], selector = 'input, select, textarea'): Promise<Locator | null> => {
  const byLabel = await firstVisible(patterns.map((pattern) => page.getByLabel(pattern)))
  if (byLabel) return byLabel

  const controls = page.locator(selector)
  const count = await controls.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index)
    if (!(await control.isVisible().catch(() => false))) continue
    const context = normalize(await fieldContext(control).catch(() => ''))
    if (patterns.some((pattern) => pattern.test(context))) return control
  }
  return null
}

const writeInput = async (locator: Locator, value: string): Promise<void> => {
  await locator.click({ clickCount: 3 })
  await locator.fill('')
  await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined)
  await locator.type(value, { delay: 20 })
}

const visiblePasswordInput = async (page: Page, cfg: DistributionConfig): Promise<Locator | null> =>
  firstVisible([page.locator(cfg.passSelector), page.locator('input[type="password"]')])

const visibleUserInput = async (page: Page, cfg: DistributionConfig): Promise<Locator | null> =>
  firstVisible([
    page.locator(cfg.userSelector),
    page.getByPlaceholder(/email|e-?mail/i),
    page.getByLabel(/e-?mail|login|usu[aá]rio/i),
    page.locator('input[type="email"]'),
    page.locator('input[name*="email"], input[name*="login"], input[name*="usuario"], input[name*="user"], input[name*="username"]'),
    page.locator('input[type="text"]:not([name*="password" i])'),
  ])

const isLoginScreen = async (page: Page, cfg: DistributionConfig): Promise<boolean> => {
  if (await visiblePasswordInput(page, cfg)) return true
  const actions = await page.locator('a, button, [role="button"], input[type="button"], input[type="submit"]').allTextContents().catch(() => [] as string[])
  const joined = normalize(actions.join(' '))
  return joined.includes('entrar') && (joined.includes('criar conta') || joined.includes('esqueceu sua senha'))
}

const waitForLoginResult = async (page: Page, cfg: DistributionConfig): Promise<boolean> => {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'), null, { timeout: 12000 }).catch(() => undefined)
  await page.waitForTimeout(800)
  return !(await isLoginScreen(page, cfg))
}

const loginIfNeeded = async (page: Page, cfg: DistributionConfig): Promise<void> => {
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
  if (!(await waitForLoginResult(page, cfg))) {
    throw new Error('Login do Classific não autenticou. Confira usuário e senha nos secrets do Fly.')
  }
}

const gotoAuthenticated = async (page: Page, cfg: DistributionConfig, url: string): Promise<void> => {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await loginIfNeeded(page, cfg)
}

const selectClassifier = async (page: Page, classifierName: string): Promise<void> => {
  const field = (await classifierField(page)) ?? (await visibleField(page, [/classificador/i], 'select, input, textarea'))
  if (!field) throw new Error('Campo Classificador não encontrado na tela de alteração da O.S.')

  const tag = await field.evaluate((node) => node.tagName.toLowerCase())
  if (tag === 'select') {
    const stopWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
    const tokens = (value: string) => normalize(value).split(' ').filter((token) => token && !stopWords.has(token))
    const wantedText = normalize(classifierName)
    const wantedTokens = tokens(classifierName)
    const comparableTokenHit = (left: string[], right: string[]) => {
      const shared = left.filter((token) => right.includes(token)).length
      return shared >= Math.min(left.length, right.length, 2)
    }
    const scoreOption = (label: string) => {
      const optionText = normalize(label)
      const optionTokens = tokens(label)
      if (optionText === wantedText) return 100
      if (optionText.includes(wantedText) || wantedText.includes(optionText)) return 90
      if (wantedTokens.length >= 2 && wantedTokens.every((token) => optionTokens.includes(token))) return 80
      if (optionTokens.length >= 2 && optionTokens.every((token) => wantedTokens.includes(token))) return 70
      if (comparableTokenHit(wantedTokens, optionTokens)) return 60
      return wantedTokens.filter((token) => optionTokens.includes(token)).length
    }

    const options = field.locator('option')
    const count = await options.count().catch(() => 0)
    const scored: Array<{ value: string; label: string; score: number }> = []
    const sample: string[] = []
    for (let index = 0; index < count; index += 1) {
      const option = options.nth(index)
      const label = (await option.textContent().catch(() => ''))?.trim() ?? ''
      const value = (await option.getAttribute('value').catch(() => null)) ?? ''
      if (label && sample.length < 12) sample.push(label)
      if (!value) continue
      const score = scoreOption(label)
      if (score > 0) scored.push({ value, label, score })
    }
    scored.sort((a, b) => b.score - a.score)
    const optionValue = scored.find((item) => item.score >= 2)?.value ?? null
    if (!optionValue) {
      const sampleText = sample.length ? ` Opções encontradas: ${sample.join(', ')}` : ''
      throw new Error(`Classificador não encontrado no select: ${classifierName}.${sampleText}`)
    }
    await field.selectOption(optionValue)
    return
  }
  await writeInput(field, classifierName)
  await page.keyboard.press('ArrowDown').catch(() => undefined)
  await page.keyboard.press('Enter').catch(() => undefined)
  await page.getByText(classifierName, { exact: false }).first().click({ timeout: 2500 }).catch(() => undefined)
}

const clickSave = async (page: Page): Promise<void> => {
  const save = await firstVisible([
    page.getByRole('button', { name: /alterar|salvar|gravar|atualizar/i }),
    page.getByRole('link', { name: /alterar|salvar|gravar|atualizar/i }),
    page.locator('button[type="submit"], input[type="submit"]'),
  ])
  if (!save) throw new Error('Botão Alterar/Salvar não encontrado na tela de alteração da O.S.')
  await save.click()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(1000)
}

const editUrlCandidates = (cfg: DistributionConfig, id: string): string[] => {
  const explicit = applyTemplate(cfg.editUrlTemplate, id)
  const detail = applyTemplate(cfg.detailUrlTemplate, id)
  const base = cfg.osListUrl.replace(/\/+$/, '')
  return [...new Set([
    explicit,
    detail.replace(/\/detalhar\/?$/i, '/alterar'),
    `${base}/${encodeURIComponent(id)}/alterar`,
    `${cfg.baseUrl}/os/${encodeURIComponent(id)}/alterar`,
  ])]
}

const findEditFromDetail = async (page: Page, cfg: DistributionConfig, id: string): Promise<string | null> => {
  await gotoAuthenticated(page, cfg, applyTemplate(cfg.detailUrlTemplate, id))
  const href = await page
    .locator('a[href*="alterar"], a:has-text("Alterar"), button:has-text("Alterar")')
    .first()
    .evaluate((el) => (el as HTMLAnchorElement).href || null)
    .catch(() => null as string | null)
  return href
}

export const changeClassificOsClassifier = async (args: {
  osId: string
  detailId?: string | null
  classifierName: string
}): Promise<{ osId: string; classifierName: string }> => {
  const cfg = loadConfig()
  if (!cfg) throw new Error('Classific não configurado: informe CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD')

  const id = String(args.detailId || args.osId || '').trim()
  const osId = String(args.osId || '').trim()
  const classifierName = String(args.classifierName || '').trim()
  if (!id || !osId) throw new Error('Informe a O.S.')
  if (!classifierName) throw new Error('Informe o classificador')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  try {
    await gotoAuthenticated(page, cfg, cfg.baseUrl)
    const candidates = editUrlCandidates(cfg, id)
    const detailEdit = await findEditFromDetail(page, cfg, id).catch(() => null)
    if (detailEdit) candidates.unshift(detailEdit)

    let opened = false
    let lastUrl = ''
    for (const url of [...new Set(candidates)]) {
      lastUrl = url
      await gotoAuthenticated(page, cfg, url).catch(() => undefined)
      const field = (await classifierField(page)) ?? (await visibleField(page, [/classificador/i], 'select, input, textarea'))
      if (field) {
        opened = true
        break
      }
    }
    if (!opened) throw new Error(`Não consegui abrir a tela de alteração da O.S. ${osId}. Última URL: ${lastUrl}`)

    await selectClassifier(page, classifierName)
    await clickSave(page)
    return { osId, classifierName }
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
