import { chromium } from 'playwright'
import type { Classificador } from '../types.js'

const getEnv = (key: string): string | undefined => {
  const v = process.env[key]
  return v && v.trim().length ? v : undefined
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '') + '/'

type ClassificLoginConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  classificadoresUrl: string
  classificadoresRowSelector: string
}

export const loadClassificLoginConfigFromEnv = (): ClassificLoginConfig | null => {
  const baseUrl = normalizeBaseUrl(getEnv('CLASSIFIC_URL') ?? 'https://sistema.classific.com.br/')
  const username = getEnv('CLASSIFIC_USERNAME')
  const password = getEnv('CLASSIFIC_PASSWORD')
  if (!username || !password) return null

  const classificadoresUrl =
    getEnv('CLASSIFIC_CLASSIFICADORES_URL') ?? `${baseUrl.replace(/\/$/, '')}/classificadores`

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
    classificadoresUrl,
    classificadoresRowSelector: getEnv('CLASSIFIC_CLASSIFICADORES_ROW_SELECTOR') ?? 'table tbody tr',
  }
}

const makeId = (nome: string, email: string | null): string => {
  const e = email?.trim().toLowerCase() || ''
  if (e) return e
  return nome.trim().toLowerCase()
}

const normalizeCell = (value: string | undefined): string | null => {
  const v = (value ?? '').trim()
  return v ? v : null
}

export const collectClassificadores = async (): Promise<Classificador[]> => {
  const cfg = loadClassificLoginConfigFromEnv()
  if (!cfg) {
    throw new Error('Classific não configurado (CLASSIFIC_USERNAME/CLASSIFIC_PASSWORD)')
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

    await page.goto(cfg.classificadoresUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    await page
      .locator(cfg.classificadoresRowSelector)
      .first()
      .waitFor({ state: 'attached', timeout: 30000 })
      .catch(() => undefined)

    const rows = await page.locator(cfg.classificadoresRowSelector).elementHandles()
    const items: Classificador[] = []

    for (const row of rows) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      if (!cols.length) continue

      const nome = normalizeCell(cols[0]) ?? ''
      if (!nome) continue

      const email = normalizeCell(cols[1])
      const whatsapp = normalizeCell(cols[2])
      const municipio = normalizeCell(cols[3])
      const uf = normalizeCell(cols[4])
      const status = normalizeCell(cols[5])
      const ativo = (status ?? '').toLowerCase() === 'ativo'

      items.push({
        id: makeId(nome, email),
        nome,
        email,
        whatsapp,
        municipio,
        uf,
        status,
        ativo,
      })
    }

    const byId = new Map<string, Classificador>()
    for (const item of items) byId.set(item.id, item)
    return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

