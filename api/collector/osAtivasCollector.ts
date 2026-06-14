import { chromium } from 'playwright'

const getEnv = (key: string): string | undefined => {
  const v = process.env[key]
  return v && v.trim().length ? v : undefined
}

const getEnvNumber = (key: string): number | undefined => {
  const v = getEnv(key)
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '') + '/'

type OsAtiva = {
  osId: string
  detailId: string | null
  clientName: string | null
  embarkPoint: string | null
  produto: string | null
  loteKg: number | null
  embarcadosKg: number | null
  remanescenteKg: number | null
  destino: string | null
  status: string | null
}

type OsAtivasConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  osListUrl: string
  osRowSelector: string
  osColId: number
  osColClient: number | null
  osColPoint: number | null
  osColProduto: number | null
  osColLote: number | null
  osColEmbarcados: number | null
  osColRemanescente: number | null
  osColDestino: number | null
  osColStatus: number | null
}

const pickColumnIndex = (headers: string[], patterns: RegExp[]): number | undefined => {
  for (const rx of patterns) {
    const idx = headers.findIndex((h) => rx.test(h))
    if (idx >= 0) return idx
  }
  return undefined
}

const toKg = (v: string | null): number | null => {
  if (!v) return null
  const cleaned = v.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const loadOsAtivasConfigFromEnv = (): OsAtivasConfig | null => {
  const baseUrl = normalizeBaseUrl(getEnv('CLASSIFIC_URL') ?? 'https://sistema.classific.com.br/')
  const username = getEnv('CLASSIFIC_USERNAME')
  const password = getEnv('CLASSIFIC_PASSWORD')
  const osListUrl = getEnv('CLASSIFIC_OS_LIST_URL')
  const osRowSelector = getEnv('CLASSIFIC_OS_ROW_SELECTOR')
  const osColId = getEnvNumber('CLASSIFIC_OS_ID_COL')

  if (!username || !password || !osListUrl || !osRowSelector || osColId == null) return null

  return {
    baseUrl,
    username,
    password,
    userSelector:
      getEnv('CLASSIFIC_LOGIN_USER_SELECTOR') ??
      'input[name="email"], input[type="email"], input[name="login"]',
    passSelector:
      getEnv('CLASSIFIC_LOGIN_PASS_SELECTOR') ?? 'input[name="password"], input[type="password"]',
    submitSelector:
      getEnv('CLASSIFIC_LOGIN_SUBMIT_SELECTOR') ?? 'button[type="submit"], input[type="submit"]',
    osListUrl,
    osRowSelector,
    osColId,
    osColClient: getEnvNumber('CLASSIFIC_OS_CLIENT_COL') ?? null,
    osColPoint: getEnvNumber('CLASSIFIC_OS_POINT_COL') ?? null,
    osColProduto: getEnvNumber('CLASSIFIC_OS_PRODUTO_COL') ?? null,
    osColLote: getEnvNumber('CLASSIFIC_OS_LOTE_COL') ?? null,
    osColEmbarcados: getEnvNumber('CLASSIFIC_OS_EMBARCADOS_COL') ?? null,
    osColRemanescente: getEnvNumber('CLASSIFIC_OS_REMANESCENTE_COL') ?? null,
    osColDestino: getEnvNumber('CLASSIFIC_OS_DESTINO_COL') ?? null,
    osColStatus: getEnvNumber('CLASSIFIC_OS_STATUS_COL') ?? null,
  }
}

const normalizeCell = (value: string | undefined): string | null => {
  const v = (value ?? '').trim()
  return v ? v : null
}

const extractDetailIdFromHref = (href: string | null): string | null => {
  if (!href) return null
  const m = href.match(/\/os\/(\d+)\/detalhar/i)
  return m?.[1] ?? null
}

export const collectOsAtivas = async (): Promise<OsAtiva[]> => {
  const cfg = loadOsAtivasConfigFromEnv()
  if (!cfg) {
    throw new Error('Classific O.S. não configurado (CLASSIFIC_OS_LIST_URL/ROW_SELECTOR/ID_COL)')
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  try {
    await page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    await page.locator(cfg.userSelector).first().fill(cfg.username)
    await page.locator(cfg.passSelector).first().fill(cfg.password)
    await page.locator(cfg.submitSelector).first().click()
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    await page.goto(cfg.osListUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    const headerTexts = await page
      .locator('table thead th')
      .allTextContents()
      .then((cells) => cells.map((t) => t.trim()).filter(Boolean))
      .catch(() => [] as string[])

    const osColPoint =
      cfg.osColPoint ??
      pickColumnIndex(headerTexts, [/ponto\s*de\s*embarque/i, /embarque/i, /ponto/i]) ??
      null
    const osColProduto =
      cfg.osColProduto ?? pickColumnIndex(headerTexts, [/produto/i]) ?? null
    const osColLote = cfg.osColLote ?? pickColumnIndex(headerTexts, [/lote/i]) ?? null
    const osColEmbarcados =
      cfg.osColEmbarcados ?? pickColumnIndex(headerTexts, [/embarcados?/i]) ?? null
    const osColRemanescente =
      cfg.osColRemanescente ??
      pickColumnIndex(headerTexts, [/remanescente/i, /saldo/i]) ??
      null
    const osColDestino =
      cfg.osColDestino ?? pickColumnIndex(headerTexts, [/destino/i]) ?? null
    const osColStatus = cfg.osColStatus ?? pickColumnIndex(headerTexts, [/status/i]) ?? null
    const osColClient =
      cfg.osColClient ?? pickColumnIndex(headerTexts, [/cliente/i]) ?? null

    await page
      .locator(cfg.osRowSelector)
      .first()
      .waitFor({ state: 'attached', timeout: 30000 })
      .catch(() => undefined)

    const rows = await page.locator(cfg.osRowSelector).elementHandles()
    const items: OsAtiva[] = []

    for (const row of rows) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      const osId = normalizeCell(cols[cfg.osColId]) ?? ''
      if (!osId) continue

      const detailHref = await row
        .$eval('a[href*="/os/"][href$="/detalhar"]', (a) => a.getAttribute('href'))
        .catch(() => null as string | null)
      const detailId = extractDetailIdFromHref(detailHref)

      const clientName = osColClient == null ? null : normalizeCell(cols[osColClient])
      const embarkPoint = osColPoint == null ? null : normalizeCell(cols[osColPoint])
      const produto = osColProduto == null ? null : normalizeCell(cols[osColProduto])
      const loteKg = osColLote == null ? null : toKg(normalizeCell(cols[osColLote]))
      const embarcadosKg =
        osColEmbarcados == null ? null : toKg(normalizeCell(cols[osColEmbarcados]))
      const remanescenteKg =
        osColRemanescente == null ? null : toKg(normalizeCell(cols[osColRemanescente]))
      const destino = osColDestino == null ? null : normalizeCell(cols[osColDestino])
      const status = osColStatus == null ? null : normalizeCell(cols[osColStatus])

      items.push({
        osId,
        detailId,
        clientName,
        embarkPoint,
        produto,
        loteKg,
        embarcadosKg,
        remanescenteKg,
        destino,
        status,
      })
    }

    const byId = new Map<string, OsAtiva>()
    for (const i of items) byId.set(i.osId, i)
    return [...byId.values()].sort((a, b) => a.osId.localeCompare(b.osId, 'pt-BR'))
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
