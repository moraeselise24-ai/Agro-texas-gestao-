import { chromium, type Page } from 'playwright'

const getEnv = (key: string): string | undefined => {
  const v = process.env[key]
  return v && v.trim().length ? v : undefined
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '') + '/'

export type OsDetalhe = {
  clientName: string | null
  destino: string | null
  produto: string | null
  embarque: string | null
  loteKg: number | null
  embarcadosKg: number | null
  remanescenteKg: number | null
  status: string | null
}

type OsDetalheConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  detalheUrlTemplate: string
}

const toKg = (v: string | null): number | null => {
  if (!v) return null
  const cleaned = v.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const normalizeValue = (raw: string | null | undefined): string | null => {
  const v = String(raw ?? '').trim()
  return v ? v : null
}

const applyTemplate = (template: string, id: string): string => template.replace(/\{id\}/g, id)

/** Slice OS detail block (avoids hidden "Registrar OS" form at page bottom). */
const extractOsDetailSection = (body: string): string => {
  const startMatch = body.match(/Ordem de Serviço n°\s*\S+/i)
  if (!startMatch || startMatch.index == null) return body

  const start = startMatch.index
  const endMarkers = ['Laudos Recentes', '\nAlterar', ' Alterar Cancelar']
  let end = body.length
  for (const marker of endMarkers) {
    const i = body.indexOf(marker, start)
    if (i > start) end = Math.min(end, i)
  }
  return body.slice(start, end)
}

/** Parse "Label: value" lines from Classific OS detail (plain text, not <strong>Label:</strong>). */
const parseLabelValueSection = (section: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const rawLine of section.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    const m = line.match(/^([^:]+):\s*(.+)$/)
    if (!m) continue
    const key = m[1].trim()
    const value = m[2].trim()
    if (key && value) out[key] = value
  }
  return out
}

const extractKvFromPage = async (page: Page): Promise<Record<string, string>> => {
  await page
    .locator('text=/Ordem de Serviço n°/i')
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => undefined)

  const body = await page.locator('body').innerText()
  const section = extractOsDetailSection(body)
  return parseLabelValueSection(section)
}

const loadOsDetalheConfigFromEnv = (): OsDetalheConfig | null => {
  const baseUrl = normalizeBaseUrl(getEnv('CLASSIFIC_URL') ?? 'https://sistema.classific.com.br/')
  const username = getEnv('CLASSIFIC_USERNAME')
  const password = getEnv('CLASSIFIC_PASSWORD')
  if (!username || !password) return null

  const detalheUrlTemplate =
    getEnv('CLASSIFIC_OS_DETALHAR_URL_TEMPLATE') ??
    `${baseUrl.replace(/\/$/, '')}/os/{id}/detalhar`

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
    detalheUrlTemplate,
  }
}

export const collectOsDetalhe = async (detailId: string): Promise<OsDetalhe> => {
  const detalhes = await collectManyOsDetalhes([detailId])
  const detalhe = detalhes.get(detailId)
  if (!detalhe) {
    throw new Error('Detalhe da O.S. não encontrado')
  }
  return detalhe
}

export const collectManyOsDetalhes = async (
  detailIds: string[],
): Promise<Map<string, OsDetalhe | null>> => {
  const ids = [...new Set(detailIds.map((id) => String(id ?? '').trim()).filter(Boolean))]
  const out = new Map<string, OsDetalhe | null>()
  if (!ids.length) return out

  const cfg = loadOsDetalheConfigFromEnv()
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

    for (const id of ids) {
      try {
        const url = applyTemplate(cfg.detalheUrlTemplate, id)
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle', { timeout: 30000 })

        const kv = await extractKvFromPage(page)

        out.set(id, {
          clientName: normalizeValue(kv['Cliente']),
          destino: normalizeValue(kv['Destino']),
          produto: normalizeValue(kv['Produto']),
          embarque: normalizeValue(kv['Embarque']),
          loteKg: toKg(normalizeValue(kv['Lote'])),
          embarcadosKg: toKg(normalizeValue(kv['Embarcados'])),
          remanescenteKg: toKg(normalizeValue(kv['Remanescente'])),
          status: normalizeValue(kv['Status']),
        })
      } catch {
        out.set(id, null)
      }
    }

    return out
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
