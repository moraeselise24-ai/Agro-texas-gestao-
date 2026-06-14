import { chromium, type Locator, type Page } from 'playwright'

type LaudoPdfConfig = {
  baseUrl: string
  username: string
  password: string
  userSelector: string
  passSelector: string
  submitSelector: string
  laudosUrl: string
  detailScanLimit: number
}

type LaudoPdfArgs = {
  laudoId: string
  plate?: string
  osId?: string
}

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]
  return value && value.trim() ? value.trim() : undefined
}

const getEnvNumber = (key: string, fallback: number): number => {
  const raw = getEnv(key)
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeBaseUrl = (raw: string): string => raw.replace(/\/+$/, '')

const loadConfig = (): LaudoPdfConfig | null => {
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
    laudosUrl: getEnv('CLASSIFIC_LAUDOS_LIST_URL') ?? `${baseUrl}/laudos`,
    detailScanLimit: getEnvNumber('CLASSIFIC_LAUDO_DETAIL_SCAN_LIMIT', 3000),
  }
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const compact = (value: string): string => normalize(value).replace(/[^a-z0-9]/g, '')

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const hasLabeledValue = (readableText: string, label: string, value: string): boolean => {
  const normalizedValue = normalize(value)
  if (!normalizedValue) return true

  const labelPattern = escapeRegExp(normalize(label)).replace(/\s+/g, '\\s+')
  const valuePattern = escapeRegExp(normalizedValue).replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${labelPattern}\\b\\s*:?\\s*${valuePattern}\\b`, 'i').test(readableText)
}

const contentMatchesRequestedLaudo = (content: string, args: LaudoPdfArgs): boolean => {
  const readableText = normalize(stripHtml(content))
  const haystack = compact(readableText)
  const plate = String(args.plate ?? '').trim()
  const laudo = String(args.laudoId ?? '').trim()
  const osId = String(args.osId ?? '').trim()

  if (plate) {
    const compactPlate = compact(plate)
    const hasMainPlate =
      hasLabeledValue(readableText, 'placa', plate) ||
      haystack.includes(`placa${compactPlate}`)

    if (!hasMainPlate) return false
  }

  if (laudo && !haystack.includes(compact(laudo))) return false
  if (osId && !haystack.includes(compact(osId))) return false

  return Boolean(plate || laudo || osId)
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

const visiblePasswordInput = async (page: Page, cfg: LaudoPdfConfig): Promise<Locator | null> =>
  firstVisible([page.locator(cfg.passSelector), page.locator('input[type="password"]')])

const visibleUserInput = async (page: Page, cfg: LaudoPdfConfig): Promise<Locator | null> =>
  firstVisible([
    page.locator(cfg.userSelector),
    page.getByPlaceholder(/email|e-?mail/i),
    page.getByLabel(/e-?mail|login|usu[aá]rio/i),
    page.locator('input[type="email"]'),
    page.locator('input[type="text"]:not([name*="password" i])'),
  ])

const writeInput = async (locator: Locator, value: string): Promise<void> => {
  await locator.click({ clickCount: 3 })
  await locator.fill('')
  await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => undefined)
  await locator.type(value, { delay: 15 })
}

const isLoginScreen = async (page: Page, cfg: LaudoPdfConfig): Promise<boolean> => {
  if (await visiblePasswordInput(page, cfg)) return true
  const text = normalize(await page.locator('body').innerText({ timeout: 2000 }).catch(() => ''))
  return text.includes('entrar') && text.includes('criar conta')
}

const loginIfNeeded = async (page: Page, cfg: LaudoPdfConfig): Promise<void> => {
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
  await page.waitForTimeout(800)

  if (await isLoginScreen(page, cfg)) {
    throw new Error('Login do Classific não autenticou. Confira CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD nos secrets do Fly.')
  }
}

const gotoAuthenticated = async (page: Page, cfg: LaudoPdfConfig, url: string): Promise<void> => {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await loginIfNeeded(page, cfg)
  if (await isLoginScreen(page, cfg)) {
    throw new Error('Classific abriu a tela de login em vez da página protegida.')
  }
}

const visibleActionLabels = async (page: Page): Promise<string> =>
  page
    .locator('a, button, [role="button"], input[type="button"], input[type="submit"]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ((node.textContent ?? '') || (node as HTMLInputElement).value || node.getAttribute('aria-label') || '').trim())
        .filter(Boolean)
        .slice(0, 12)
        .join(', '),
    )
    .catch(() => '-')

const getDetailHrefFromRow = async (row: Locator): Promise<string | null> => {
  const hrefs = await row
    .locator('a[href]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href).filter(Boolean))
    .catch(() => [] as string[])

  return (
    hrefs.find((href) => /\/laudos\/[^/]+\/detalhar/i.test(href)) ??
    hrefs.find((href) => /\/laudos\/[^/]+/i.test(href)) ??
    null
  )
}

const extractLaudoDetailId = (href: string | null | undefined): number | null => {
  const match = href?.match(/\/laudos\/(\d+)\/detalhar/i)
  if (!match) return null
  const id = Number(match[1])
  return Number.isFinite(id) ? id : null
}

const collectDetailIdsFromCurrentPage = async (page: Page): Promise<number[]> => {
  const hrefs = await page
    .locator('a[href*="/laudos/"][href*="/detalhar"]')
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href).filter(Boolean))
    .catch(() => [] as string[])

  return Array.from(new Set(hrefs.map(extractLaudoDetailId).filter((id): id is number => id != null)))
}

const findLaudoRowOnCurrentPage = async (page: Page, args: LaudoPdfArgs): Promise<Locator | null> => {
  const identifiers = [args.laudoId, args.plate, args.osId]
    .map((value) => compact(value ?? ''))
    .filter(Boolean)

  const rows = page.locator('table tbody tr')
  const count = await rows.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const text = compact(await row.innerText().catch(() => ''))
    if (!identifiers.every((identifier) => text.includes(identifier))) continue
    return row
  }

  return null
}

const clickNextListPage = async (page: Page): Promise<boolean> => {
  const beforeUrl = page.url()
  const beforeFirstRow = normalize(await page.locator('table tbody tr').first().innerText({ timeout: 1500 }).catch(() => ''))

  const candidates = [
    page.locator('a[rel="next"], button[rel="next"]'),
    page.getByRole('link', { name: /pr[oó]xima|seguinte|next|›|»|>/i }),
    page.getByRole('button', { name: /pr[oó]xima|seguinte|next|›|»|>/i }),
    page.locator('.pagination a, .pagination button, nav a, nav button').filter({ hasText: /pr[oó]xima|seguinte|next|›|»|>/i }),
  ]

  const next = await firstVisible(candidates)
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
  await page.waitForTimeout(450)

  const afterUrl = page.url()
  const afterFirstRow = normalize(await page.locator('table tbody tr').first().innerText({ timeout: 1500 }).catch(() => ''))
  return beforeUrl !== afterUrl || beforeFirstRow !== afterFirstRow
}

const htmlMatchesLaudo = (html: string, args: LaudoPdfArgs): boolean => {
  return contentMatchesRequestedLaudo(html, args)
}

const findDetailByInternalIdScan = async (
  page: Page,
  cfg: LaudoPdfConfig,
  args: LaudoPdfArgs,
  knownDetailIds: number[],
): Promise<string | null> => {
  const maxKnown = Math.max(...knownDetailIds.filter(Number.isFinite))
  if (!Number.isFinite(maxKnown) || maxKnown <= 0) return null

  const start = maxKnown + 25
  const end = Math.max(1, start - cfg.detailScanLimit)
  const request = page.context().request
  const concurrency = 8

  for (let cursor = start; cursor >= end; cursor -= concurrency) {
    const ids = Array.from({ length: concurrency }, (_, offset) => cursor - offset).filter((id) => id >= end)
    const matches = await Promise.all(
      ids.map(async (id) => {
        const url = `${cfg.baseUrl}/laudos/${id}/detalhar`
        try {
          const response = await request.get(url, { timeout: 8000 })
          if (!response.ok()) return null
          const html = await response.text()
          return htmlMatchesLaudo(html, args) ? url : null
        } catch {
          return null
        }
      }),
    )

    const match = matches.find(Boolean)
    if (match) return match
  }

  return null
}

const openLaudoDetail = async (page: Page, cfg: LaudoPdfConfig, args: LaudoPdfArgs): Promise<void> => {
  await gotoAuthenticated(page, cfg, cfg.laudosUrl)

  const visitedPages = new Set<string>()
  const knownDetailIds = new Set<number>()

  for (let pageIndex = 1; pageIndex <= 80; pageIndex += 1) {
    const fingerprint = [
      page.url(),
      normalize(await page.locator('table tbody tr').first().innerText({ timeout: 1500 }).catch(() => '')),
    ].join('::')
    if (visitedPages.has(fingerprint)) break
    visitedPages.add(fingerprint)

    for (const id of await collectDetailIdsFromCurrentPage(page)) knownDetailIds.add(id)

    const row = await findLaudoRowOnCurrentPage(page, args)
    if (!row) {
      const moved = await clickNextListPage(page)
      if (!moved) break
      continue
    }

    const href = await getDetailHrefFromRow(row)
    if (href) {
      await gotoAuthenticated(page, cfg, href)
      return
    }

    const detail = await firstVisible([
      row.getByRole('link', { name: /detalhar|visualizar|ver/i }),
      row.getByRole('button', { name: /detalhar|visualizar|ver/i }),
    ])
    if (detail) {
      await detail.click()
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
      await loginIfNeeded(page, cfg)
      return
    }
  }

  const detailUrl = await findDetailByInternalIdScan(page, cfg, args, Array.from(knownDetailIds))
  if (detailUrl) {
    await gotoAuthenticated(page, cfg, detailUrl)
    return
  }

  throw new Error(
    `Laudo ${args.laudoId} não encontrado na lista do Classific após varrer a paginação e ${cfg.detailScanLimit} detalhes internos. Ações visíveis: ${await visibleActionLabels(page)}`,
  )
}

const prepareDetailPageForPdf = async (page: Page, args: LaudoPdfArgs): Promise<void> => {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => undefined)
  await page.waitForFunction(() => document.body?.innerText.trim().length > 80, { timeout: 15000 }).catch(() => undefined)

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '')
  if (!bodyText.trim()) {
    throw new Error(`Laudo ${args.laudoId} abriu no Classific, mas a página de detalhe veio sem conteúdo para gerar PDF.`)
  }

  if (!contentMatchesRequestedLaudo(bodyText, args)) {
    const expected = [
      args.laudoId ? `laudo ${args.laudoId}` : null,
      args.plate ? `placa ${args.plate}` : null,
      args.osId ? `O.S. ${args.osId}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    throw new Error(`O Classific abriu um laudo diferente do registro solicitado (${expected}). Sincronize os dados e tente novamente.`)
  }

  await page.addStyleTag({
    content: `
      @page { size: A4; margin: 10mm; }
      html, body {
        background: #fff !important;
        color: #2b2b2b !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      aside, nav, header, footer,
      .sidebar, [class*="sidebar"], [class*="menu"], [class*="nav"],
      button, input[type="button"], input[type="submit"],
      a[href$="/laudos"], a[href*="/laudos?"],
      a[href*="voltar" i], a[href*="alterar" i], a[href*="cancelar" i] {
        display: none !important;
      }
      main, section, article, .container, .content, [class*="content"] {
        max-width: none !important;
        width: 100% !important;
        margin: 0 !important;
      }
      * {
        box-shadow: none !important;
      }
    `,
  }).catch(() => undefined)
}

export const buildClassificLaudoPdf = async (args: LaudoPdfArgs): Promise<Buffer> => {
  const cfg = loadConfig()
  if (!cfg) throw new Error('Classific não configurado: informe CLASSIFIC_USERNAME e CLASSIFIC_PASSWORD')

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()

  try {
    await openLaudoDetail(page, cfg, args)
    await prepareDetailPageForPdf(page, args)
    await page.emulateMedia({ media: 'screen' }).catch(() => undefined)
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    })
    return pdf
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
