import type { OsRecord } from '../types.js'
import { OS_DAY_VOLUME_ID_PREFIX } from '../services/volume.js'
import { isIsoDate, normalizeDateToIso } from '../utils/normalizeDate.js'
import { todayInTimeZone } from '../utils/todayInTz.js'

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

const toNumber = (v: string): number => {
  const cleaned = v.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

const kgToTons = (kg: number): number => kg / 1000

const slugPart = (value: string): string =>
  value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

const makeRneId = (args: {
  date: string
  osId: string
  clientName: string
  embarkPoint: string
  classifier: string
}): string =>
  `RNE-${args.date}-${slugPart(args.osId)}-${slugPart(args.classifier)}-${slugPart(args.clientName)}-${slugPart(args.embarkPoint)}`

export type CollectorConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  osListUrl: string
  osRowSelector: string
  osColId: number
  osColClient: number
  osColPoint: number
  osColEmbarkedKg: number
  osColEmbarcadoHojeKg?: number
  osColStatus?: number
  laudosListUrl: string
  laudosRowSelector: string
  laudosColDate: number
  laudosColId: number
  laudosColOsId: number
  laudosColTonsKg?: number
  laudosColClient?: number
  laudosColStatus?: number
  rneListUrl?: string
  rneRowSelector?: string
  rneColDate?: number
  rneColOsId?: number
  rneColClient?: number
  rneColPoint?: number
  rneColClassifier?: number
}

export const loadCollectorConfigFromEnv = (): CollectorConfig | null => {
  const baseUrl = getEnv('CLASSIFIC_URL') ?? 'https://sistema.classific.com.br/'
  const username = getEnv('CLASSIFIC_USERNAME')
  const password = getEnv('CLASSIFIC_PASSWORD')
  const osListUrl = getEnv('CLASSIFIC_OS_LIST_URL')
  const osRowSelector = getEnv('CLASSIFIC_OS_ROW_SELECTOR')
  const laudosListUrl = getEnv('CLASSIFIC_LAUDOS_LIST_URL')
  const laudosRowSelector = getEnv('CLASSIFIC_LAUDOS_ROW_SELECTOR')

  const osColId = getEnvNumber('CLASSIFIC_OS_ID_COL')
  const osColClient = getEnvNumber('CLASSIFIC_OS_CLIENT_COL')
  const osColPoint = getEnvNumber('CLASSIFIC_OS_POINT_COL')
  const osColEmbarkedKg = getEnvNumber('CLASSIFIC_OS_EMBARCADOS_COL')

  const laudosColDate = getEnvNumber('CLASSIFIC_LAUDOS_DATE_COL')
  const laudosColId = getEnvNumber('CLASSIFIC_LAUDOS_ID_COL')
  const laudosColOsId = getEnvNumber('CLASSIFIC_LAUDOS_OS_ID_COL')

  if (
    !username ||
    !password ||
    !osListUrl ||
    !osRowSelector ||
    !laudosListUrl ||
    !laudosRowSelector ||
    osColId == null ||
    osColClient == null ||
    osColPoint == null ||
    osColEmbarkedKg == null ||
    laudosColDate == null ||
    laudosColId == null ||
    laudosColOsId == null
  ) {
    return null
  }

  return {
    baseUrl,
    username,
    password,
    userSelector: getEnv('CLASSIFIC_LOGIN_USER_SELECTOR') ?? 'input[name="email"], input[type="email"], input[name="login"]',
    passSelector: getEnv('CLASSIFIC_LOGIN_PASS_SELECTOR') ?? 'input[name="password"], input[type="password"]',
    submitSelector: getEnv('CLASSIFIC_LOGIN_SUBMIT_SELECTOR') ?? 'button[type="submit"], input[type="submit"]',
    osListUrl,
    osRowSelector,
    osColId,
    osColClient,
    osColPoint,
    osColEmbarkedKg,
    osColEmbarcadoHojeKg: getEnvNumber('CLASSIFIC_OS_EMBARCADO_HOJE_COL'),
    osColStatus: getEnvNumber('CLASSIFIC_OS_STATUS_COL'),
    laudosListUrl,
    laudosRowSelector,
    laudosColDate,
    laudosColId,
    laudosColOsId,
    laudosColTonsKg: getEnvNumber('CLASSIFIC_LAUDOS_TONS_COL'),
    laudosColClient: getEnvNumber('CLASSIFIC_LAUDOS_CLIENT_COL'),
    laudosColStatus: getEnvNumber('CLASSIFIC_LAUDOS_STATUS_COL'),
    rneListUrl: getEnv('CLASSIFIC_RNE_LIST_URL'),
    rneRowSelector: getEnv('CLASSIFIC_RNE_ROW_SELECTOR'),
    rneColDate: getEnvNumber('CLASSIFIC_RNE_DATE_COL'),
    rneColOsId: getEnvNumber('CLASSIFIC_RNE_OS_ID_COL'),
    rneColClient: getEnvNumber('CLASSIFIC_RNE_CLIENT_COL'),
    rneColPoint: getEnvNumber('CLASSIFIC_RNE_POINT_COL'),
    rneColClassifier: getEnvNumber('CLASSIFIC_RNE_CLASSIFIER_COL'),
  }
}

export type OsColumnInfo = {
  index: number
  header: string
  sample: string
}

export type DiscoverOsColumnsResult = {
  headers: OsColumnInfo[]
  suggested: {
    osId?: number
    client?: number
    point?: number
    embarcadosTotal?: number
    embarcadoHoje?: number
    status?: number
  }
  sampleRows: Array<{ osId: string; values: string[] }>
  flySecretsCommand: string | null
}

const pickColumnIndex = (headers: string[], patterns: RegExp[]): number | undefined => {
  const idx = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
  return idx >= 0 ? idx : undefined
}

export type DiscoverLaudosColumnsResult = {
  headers: OsColumnInfo[]
  suggested: { date?: number; laudoId?: number; osId?: number; tonsKg?: number }
  flySecretsCommand: string | null
}

export const discoverLaudosColumns = async (
  cfg: CollectorConfig,
): Promise<DiscoverLaudosColumnsResult> => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  try {
    await page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
    await page.locator(cfg.userSelector).first().fill(cfg.username)
    await page.locator(cfg.passSelector).first().fill(cfg.password)
    await page.locator(cfg.submitSelector).first().click()
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    await page.goto(cfg.laudosListUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    const headerTexts = await page
      .locator('table thead th')
      .allTextContents()
      .then((cells) => cells.map((t) => t.trim()).filter(Boolean))
      .catch(() => [] as string[])

    const rowHandles = await page.locator(cfg.laudosRowSelector).elementHandles()
    const rowValues: string[][] = []
    for (const row of rowHandles.slice(0, 8)) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      if (cols.length) rowValues.push(cols)
    }

    const columnCount = Math.max(headerTexts.length, rowValues[0]?.length ?? 0)
    const headers: OsColumnInfo[] = []
    for (let index = 0; index < columnCount; index += 1) {
      headers.push({
        index,
        header: headerTexts[index] ?? `(sem título ${index})`,
        sample: rowValues.find((row) => row[index])?.[index] ?? '',
      })
    }

    const headerLabels = headers.map((h) => h.header)
    const tonsKg = pickColumnIndex(headerLabels, [
      /embarcado/i,
      /kg/i,
      /tonelada/i,
      /volume/i,
      /peso/i,
      /quantidade/i,
    ])

    const suggested = {
      date: pickColumnIndex(headerLabels, [/data/i]) ?? cfg.laudosColDate,
      laudoId:
        pickColumnIndex(headerLabels, [/laudo/i, /^n[uú]mero$/i]) ?? cfg.laudosColId,
      osId: pickColumnIndex(headerLabels, [/n[º°°]\s*os/i, /\bos\b/i]) ?? cfg.laudosColOsId,
      tonsKg,
    }

    const flySecretsCommand =
      tonsKg == null
        ? null
        : `fly secrets set -a inspectcheck-dashboard-walison CLASSIFIC_LAUDOS_TONS_COL="${tonsKg}"`

    return { headers, suggested, flySecretsCommand }
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

export const discoverOsColumns = async (cfg: CollectorConfig): Promise<DiscoverOsColumnsResult> => {
  const { chromium } = await import('playwright')
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

    const rowHandles = await page.locator(cfg.osRowSelector).elementHandles()
    const rowValues: string[][] = []
    for (const row of rowHandles.slice(0, 8)) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      if (cols.length) rowValues.push(cols)
    }

    const columnCount = Math.max(headerTexts.length, rowValues[0]?.length ?? 0)
    const headers: OsColumnInfo[] = []
    for (let index = 0; index < columnCount; index += 1) {
      headers.push({
        index,
        header: headerTexts[index] ?? `(sem título ${index})`,
        sample: rowValues.find((row) => row[index])?.[index] ?? '',
      })
    }

    const headerLabels = headers.map((h) => h.header)
    const suggested = {
      osId: pickColumnIndex(headerLabels, [/^os$/i, /n[º°]?\s*os/i, /\bos\b/i]) ?? cfg.osColId,
      client: pickColumnIndex(headerLabels, [/cliente/i]) ?? cfg.osColClient,
      point: pickColumnIndex(headerLabels, [/embarque/i, /ponto/i]) ?? cfg.osColPoint,
      embarcadosTotal:
        pickColumnIndex(headerLabels, [/embarcados?(?!.*hoje)/i, /total.*embarc/i]) ??
        cfg.osColEmbarkedKg,
      embarcadoHoje:
        pickColumnIndex(headerLabels, [/embarcado\s*hoje/i, /hoje/i, /embarc.*hoje/i]) ??
        cfg.osColEmbarcadoHojeKg,
      status: pickColumnIndex(headerLabels, [/status/i, /situa/i]) ?? cfg.osColStatus,
    }

    const sampleRows = rowValues
      .map((values) => ({
        osId: values[suggested.osId ?? cfg.osColId] ?? '',
        values,
      }))
      .filter((row) => row.osId)
      .slice(0, 5)

    const hojeCol = suggested.embarcadoHoje
    const flySecretsCommand =
      hojeCol == null
        ? null
        : `fly secrets set -a inspectcheck-dashboard-walison CLASSIFIC_OS_EMBARCADO_HOJE_COL="${hojeCol}"`

    return { headers, suggested, sampleRows, flySecretsCommand }
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}

export const collectFromClassific = async (cfg: CollectorConfig): Promise<OsRecord[]> => {
  const { chromium } = await import('playwright')
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

    const rows = await page.locator(cfg.osRowSelector).elementHandles()
    const collectTz = process.env.COLLECT_SCHEDULE_TZ?.trim() || 'America/Cuiaba'
    const todayIso = todayInTimeZone(collectTz)

    const osById = new Map<
      string,
      {
        clientName: string
        embarkPoint: string
        tonsToday: number
        tonsCumulative: number
        status: string | null
      }
    >()

    for (const row of rows) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      const id = cols[cfg.osColId] ?? ''
      const clientName = cols[cfg.osColClient] ?? ''
      const embarkPoint = cols[cfg.osColPoint] ?? ''
      const embarkedKgRaw = cols[cfg.osColEmbarkedKg] ?? ''
      const embarcadoHojeKgRaw =
        cfg.osColEmbarcadoHojeKg == null ? '' : cols[cfg.osColEmbarcadoHojeKg] ?? ''
      const statusRaw = cfg.osColStatus == null ? '' : cols[cfg.osColStatus] ?? ''

      if (!id || !clientName || !embarkPoint) continue

      const tonsToday =
        cfg.osColEmbarcadoHojeKg == null ? 0 : kgToTons(toNumber(embarcadoHojeKgRaw))
      const tonsCumulative = kgToTons(toNumber(embarkedKgRaw))

      osById.set(id, {
        clientName,
        embarkPoint,
        tonsToday,
        tonsCumulative,
        status: statusRaw ? statusRaw : null,
      })
    }

    await page.goto(cfg.laudosListUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 30000 })

    const laudosRows = await page.locator(cfg.laudosRowSelector).elementHandles()
    const records: OsRecord[] = []
    const osIdsWithLaudoToday = new Set<string>()

    for (const row of laudosRows) {
      const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
      const id = cols[cfg.laudosColId] ?? ''
      const osId = cols[cfg.laudosColOsId] ?? ''
      const dateRaw = cols[cfg.laudosColDate] ?? ''
      const statusRaw = cfg.laudosColStatus == null ? '' : cols[cfg.laudosColStatus] ?? ''
      const clientFromLaudos = cfg.laudosColClient == null ? '' : cols[cfg.laudosColClient] ?? ''

      const date = normalizeDateToIso(dateRaw)
      const os = osById.get(osId)
      const clientName = os?.clientName ?? clientFromLaudos
      const embarkPoint = os?.embarkPoint ?? ''

      let tons = 0
      if (cfg.laudosColTonsKg != null) {
        if (date === todayIso && os && cfg.osColEmbarcadoHojeKg != null) {
          osIdsWithLaudoToday.add(osId)
          continue
        }
        tons = kgToTons(toNumber(cols[cfg.laudosColTonsKg] ?? ''))
      } else if (date === todayIso && os) {
        osIdsWithLaudoToday.add(osId)
        tons = os.tonsToday > 0 ? os.tonsToday : os.tonsCumulative
      }

      if (!id || !osId || !isIsoDate(date) || !clientName || !embarkPoint) continue
      if (tons <= 0) continue

      records.push({
        id,
        osId,
        date,
        clientName,
        embarkPoint,
        tons,
        rne: null,
        status: statusRaw ? statusRaw : os?.status ?? null,
      })
    }

    if (cfg.osColEmbarcadoHojeKg != null && osIdsWithLaudoToday.size) {
      for (const osId of osIdsWithLaudoToday) {
        const os = osById.get(osId)
        if (!os) continue

        const tons = os.tonsToday
        if (tons <= 0) continue

        records.push({
          id: `${OS_DAY_VOLUME_ID_PREFIX}${todayIso}-${slugPart(osId)}`,
          osId,
          date: todayIso,
          clientName: os.clientName,
          embarkPoint: os.embarkPoint,
          tons,
          rne: null,
          status: os.status,
        })
      }
    }

    if (
      cfg.rneListUrl &&
      cfg.rneRowSelector &&
      cfg.rneColDate != null &&
      cfg.rneColOsId != null &&
      cfg.rneColClient != null &&
      cfg.rneColPoint != null
    ) {
      await page.goto(cfg.rneListUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 30000 })
      await page
        .locator(cfg.rneRowSelector)
        .first()
        .waitFor({ state: 'attached', timeout: 30000 })
        .catch(() => undefined)

      const rneRows = await page.locator(cfg.rneRowSelector).elementHandles()
      const usedRneIds = new Set<string>()
      for (const row of rneRows) {
        const cols = await row.$$eval('td', (tds) => tds.map((t) => (t.textContent ?? '').trim()))
        if (!cols.length) continue

        const dateRaw = cols[cfg.rneColDate!] ?? ''
        const osId = cols[cfg.rneColOsId!] ?? ''
        const clientName = cols[cfg.rneColClient!] ?? ''
        const embarkPoint = cols[cfg.rneColPoint!] ?? ''
        const classifier =
          cfg.rneColClassifier == null ? '' : cols[cfg.rneColClassifier] ?? ''

        const date = normalizeDateToIso(dateRaw)
        if (!isIsoDate(date) || !osId || !clientName || !embarkPoint) continue

        let id = makeRneId({ date, osId, clientName, embarkPoint, classifier })
        let suffix = 0
        while (usedRneIds.has(id)) {
          suffix += 1
          id = `${makeRneId({ date, osId, clientName, embarkPoint, classifier })}-${suffix}`
        }
        usedRneIds.add(id)

        records.push({
          id,
          osId,
          date,
          clientName,
          embarkPoint,
          tons: 0,
          rne: 1,
          status: 'RNE',
        })
      }
    }

    return records
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
