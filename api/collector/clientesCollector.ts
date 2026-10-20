import { chromium, type BrowserContext, type Locator, type Page } from 'playwright'
import type { ServiceOrderOptionInput } from '../repositories/serviceOrdersRepo.js'

type ClientesCollectorConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  clientesUrl: string
  rowSelector: string
  nameCol: number
  municipioCol: number | null
  ufCol: number | null
}

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : undefined
}

const getEnvNumber = (key: string): number | null => {
  const raw = getEnv(key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '')

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const cleanCell = (value: string | undefined): string | null => {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  if (/^(detalhar|alterar|excluir|visualizar)$/i.test(clean)) return null
  return clean
}

const isLikelyClientName = (value: string | null | undefined): value is string => {
  const clean = cleanCell(value)
  if (!clean) return false
  if (clean.length < 3) return false
  if (/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i.test(clean.replace(/[^a-z0-9]/gi, ''))) return false
  if (/^R\$\s*[\d.,]+$/i.test(clean)) return false
  if (/^\d+([.,]\d+)?$/.test(clean)) return false
  if (/^teste\s+gr[aá]tis/i.test(clean)) return false
  return /[a-zÀ-ÿ]{3,}/i.test(clean)
}

const absoluteUrl = (href: string, cfg: ClientesCollectorConfig): string => {
  try {
    return new URL(href, cfg.baseUrl).toString()
  } catch {
    return href
  }
}

const parseLegalNameFromDetail = (text: string): string | null => {
  const compact = text.replace(/\s+/g, ' ').trim()
  const match = compact.match(
    /Raz[aã]o Social:\s*(.+?)(?:\s+CNPJ:|\s+Nome Fantasia:|\s+E-?mail:|\s+Telefone:|\s+Logradouro|$)/i,
  )
  return cleanCell(match?.[1])
}

export const loadClientesCollectorConfigFromEnv = (): ClientesCollectorConfig | null => {
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
    clientesUrl: getEnv('CLASSIFIC_CLIENTES_URL') ?? `${baseUrl}/clientes`,
    rowSelector: getEnv('CLASSIFIC_CLIENTES_ROW_SELECTOR') ?? 'table tbody tr',
    nameCol: getEnvNumber('CLASSIFIC_CLIENTES_NAME_COL') ?? 0,
    municipioCol: getEnvNumber('CLASSIFIC_CLIENTES_MUNICIPIO_COL') ?? 4,
    ufCol: getEnvNumber('CLASSIFIC_CLIENTES_UF_COL') ?? 5,
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

const visiblePasswordInput = async (page: Page, cfg: ClientesCollectorConfig): Promise<Locator | null> =>
  firstVisible([page.locator(cfg.passSelector), page.locator('input[type="password"]')])

const visibleUserInput = async (page: Page, cfg: ClientesCollectorConfig): Promise<Locator | null> =>
  firstVisible([
    page.locator(cfg.userSelector),
    page.getByPlaceholder(/email|e-?mail/i),
    page.getByLabel(/e-?mail|login|usu[aá]rio/i),
    page.locator('input[type="email"]'),
    page.locator('input[type="text"]:not([name*="password" i])'),
  ])

const isLoginScreen = async (page: Page, cfg: ClientesCollectorConfig): Promise<boolean> => {
  if (await visiblePasswordInput(page, cfg)) return true
  const text = normalize(await page.locator('body').innerText({ timeout: 2000 }).catch(() => ''))
  return text.includes('entrar') && text.includes('criar conta')
}

const loginIfNeeded = async (page: Page, cfg: ClientesCollectorConfig): Promise<void> => {
  await page.waitForTimeout(500)
  const passwordInput = await visiblePasswordInput(page, cfg)
  if (!passwordInput) return

  const userInput = await visibleUserInput(page, cfg)
  if (!userInput) throw new Error(`Tela de login detectada, mas campo de usuário não encontrado. URL atual: ${page.url()}`)

  await userInput.fill(cfg.username)
  await passwordInput.fill(cfg.password)

  const submit = await firstVisible([
    page.locator(cfg.submitSelector),
    page.getByRole('button', { name: /entrar|login|acessar/i }),
    page.getByRole('link', { name: /entrar|login|acessar/i }),
  ])
  if (!submit) throw new Error(`Tela de login detectada, mas botão Entrar não encontrado. URL atual: ${page.url()}`)

  await submit.click()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(800)

  if (await isLoginScreen(page, cfg)) {
    throw new Error('Login do Classific não autenticou ao sincronizar clientes.')
  }
}

const gotoAuthenticated = async (page: Page, cfg: ClientesCollectorConfig, url: string): Promise<void> => {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await loginIfNeeded(page, cfg)
}

const readLegalNameFromDetail = async (
  page: Page,
  cfg: ClientesCollectorConfig,
  href: string | null,
): Promise<string | null> => {
  if (!href) return null
  await gotoAuthenticated(page, cfg, absoluteUrl(href, cfg))
  const body = await page.locator('body').innerText({ timeout: 10000 }).catch(() => '')
  return parseLegalNameFromDetail(body)
}

const readCurrentPageClients = async (
  page: Page,
  detailPage: Page,
  cfg: ClientesCollectorConfig,
): Promise<ServiceOrderOptionInput[]> => {
  const rows = await page.locator(cfg.rowSelector).elementHandles()
  const items: ServiceOrderOptionInput[] = []

  for (const row of rows) {
    const cols = await row.$$eval('td', (tds) => tds.map((td) => (td.textContent ?? '').trim())).catch(() => [])
    if (!cols.length) continue

    const name = cleanCell(cols[cfg.nameCol])
    if (!name) continue

    const detailHref = await row
      .$$eval('a', (anchors) => {
        const found = anchors.find((anchor) => {
          const href = (anchor as HTMLAnchorElement).href ?? ''
          const text = anchor.textContent ?? ''
          return /detalhar/i.test(text) || /\/clientes\/\d+\/detalhar/i.test(href)
        })
        return found ? ((found as HTMLAnchorElement).href || found.getAttribute('href')) : null
      })
      .catch(() => null)
    const legalName = await readLegalNameFromDetail(detailPage, cfg, detailHref)
    const selectedName = cleanCell(legalName ?? undefined) ?? name
    if (!isLikelyClientName(selectedName)) continue

    items.push({
      type: 'client',
      name: selectedName,
      municipio: cfg.municipioCol == null ? null : cleanCell(cols[cfg.municipioCol]),
      uf: cfg.ufCol == null ? null : cleanCell(cols[cfg.ufCol]),
    })
  }

  return items
}

const clickNextPage = async (page: Page): Promise<boolean> => {
  const beforeUrl = page.url()
  const beforeFirstRow = normalize(await page.locator('table tbody tr').first().innerText({ timeout: 1500 }).catch(() => ''))
  const next = await firstVisible([
    page.locator('a[rel="next"], button[rel="next"]'),
    page.getByRole('link', { name: /pr[oó]xima|seguinte|next|›|»|>/i }),
    page.getByRole('button', { name: /pr[oó]xima|seguinte|next|›|»|>/i }),
    page.locator('.pagination a, .pagination button, nav a, nav button').filter({ hasText: /pr[oó]xima|seguinte|next|›|»|>/i }),
  ])
  if (!next) return false

  const disabled = await next
    .evaluate((node) => {
      const element = node as HTMLElement
      const ariaDisabled = element.getAttribute('aria-disabled')
      const className = element.getAttribute('class') ?? ''
      return (
        ariaDisabled === 'true' ||
        element.hasAttribute('disabled') ||
        /\bdisabled\b/i.test(className) ||
        element.closest('.disabled,[aria-disabled="true"]') != null
      )
    })
    .catch(() => false)
  if (disabled) return false

  await next.click()
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(350)

  const afterUrl = page.url()
  const afterFirstRow = normalize(await page.locator('table tbody tr').first().innerText({ timeout: 1500 }).catch(() => ''))
  return beforeUrl !== afterUrl || beforeFirstRow !== afterFirstRow
}

export const collectClientesOptions = async (): Promise<ServiceOrderOptionInput[]> => {
  const cfg = loadClientesCollectorConfigFromEnv()
  if (!cfg) throw new Error('Classific não configurado (CLASSIFIC_USERNAME/CLASSIFIC_PASSWORD)')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context: BrowserContext = await browser.newContext()
  const page = await context.newPage()
  const detailPage = await context.newPage()

  try {
    await gotoAuthenticated(page, cfg, cfg.clientesUrl)
    await page
      .locator(cfg.rowSelector)
      .first()
      .waitFor({ state: 'attached', timeout: 30000 })
      .catch(() => undefined)

    const collected = new Map<string, ServiceOrderOptionInput>()
    const visited = new Set<string>()

    for (let pageIndex = 1; pageIndex <= 80; pageIndex += 1) {
      const fingerprint = [
        page.url(),
        normalize(await page.locator(cfg.rowSelector).first().innerText({ timeout: 1500 }).catch(() => '')),
      ].join('::')
      if (visited.has(fingerprint)) break
      visited.add(fingerprint)

      for (const item of await readCurrentPageClients(page, detailPage, cfg)) {
        const key = normalize(item.name ?? '')
        if (key) collected.set(key, item)
      }

      const moved = await clickNextPage(page)
      if (!moved) break
    }

    return [...collected.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'))
  } finally {
    await detailPage.close().catch(() => undefined)
    await page.close().catch(() => undefined)
    await context.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
