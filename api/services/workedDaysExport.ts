import fs from 'fs'
import path from 'path'
import type { WorkedDayClassifierSummary, WorkedDaysTotals } from '../types.js'

const tonsFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integerFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Cuiaba',
})

const formatDate = (value: string): string => {
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const __dirname = process.cwd()

const readLogoDataUri = (): string | null => {
  const candidates = [
    path.resolve(__dirname, '../../public/logo2.png'),
    path.resolve(__dirname, '../../public/logo.png'),
    path.resolve(__dirname, '../public/logo2.png'),
    path.resolve(__dirname, '../public/logo.png'),
    path.resolve(process.cwd(), 'public/logo2.png'),
    path.resolve(process.cwd(), 'public/logo.png'),
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    const bytes = fs.readFileSync(file)
    return `data:image/png;base64,${bytes.toString('base64')}`
  }
  return null
}

const flattenRows = (items: WorkedDayClassifierSummary[]) =>
  items.flatMap((item) =>
    item.dates.flatMap((date) =>
      date.serviceOrders.length
        ? date.serviceOrders.map((order) => ({
            classifierName: item.classifierName,
            date: date.date,
            farmName: order.farmName,
            osId: order.osId,
            tons: order.tons,
            rneCount: order.rneCount,
          }))
        : [
            {
              classifierName: item.classifierName,
              date: date.date,
              farmName: 'Fazenda não informada',
              osId: date.osIds.join(', '),
              tons: date.tons,
              rneCount: date.rneCount,
            },
          ],
    ),
  )

export const buildWorkedDaysXlsx = async (args: {
  items: WorkedDayClassifierSummary[]
  totals: WorkedDaysTotals
}): Promise<Buffer> => {
  const mod = (await import('exceljs')) as unknown as { default?: any }
  const ExcelJS = mod.default ?? (mod as any)
  const workbook = new ExcelJS.Workbook()
  const summary = workbook.addWorksheet('Resumo')
  const details = workbook.addWorksheet('Dias e OS')

  summary.columns = [
    { header: 'Classificador', key: 'classifierName', width: 32 },
    { header: 'Dias trabalhados', key: 'daysWorked', width: 18 },
    { header: 'Dias volume', key: 'volumeDays', width: 16 },
    { header: 'Dias RNE', key: 'rneDays', width: 14 },
    { header: 'Volume (t)', key: 'tons', width: 16 },
    { header: 'RNE', key: 'rneCount', width: 10 },
    { header: 'O.S.', key: 'osCount', width: 10 },
  ]

  for (const item of args.items) {
    summary.addRow({
      classifierName: item.classifierName,
      daysWorked: item.daysWorked,
      volumeDays: item.volumeDays,
      rneDays: item.rneDays,
      tons: item.tons,
      rneCount: item.rneCount,
      osCount: item.osCount,
    })
  }

  summary.addRow({})
  summary.addRow({
    classifierName: 'Totais',
    daysWorked: args.totals.daysWorked,
    tons: args.totals.tons,
    rneCount: args.totals.rneCount,
    osCount: args.totals.osCount,
  })

  details.columns = [
    { header: 'Classificador', key: 'classifierName', width: 32 },
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Fazenda/embarque', key: 'farmName', width: 38 },
    { header: 'O.S.', key: 'osId', width: 18 },
    { header: 'Volume (t)', key: 'tons', width: 16 },
    { header: 'RNE', key: 'rneCount', width: 10 },
  ]

  for (const row of flattenRows(args.items)) {
    details.addRow({
      classifierName: row.classifierName,
      date: row.date,
      farmName: row.farmName,
      osId: row.osId,
      tons: row.tons,
      rneCount: row.rneCount,
    })
  }

  for (const sheet of [summary, details]) {
    sheet.getRow(1).font = { bold: true }
    sheet.getColumn('tons').numFmt = '#,##0.00'
  }

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return Buffer.from(buf)
}

export const buildWorkedDaysPdf = async (args: {
  items: WorkedDayClassifierSummary[]
  totals: WorkedDaysTotals
  from: string
  to: string
  extractedAt?: Date
}): Promise<Buffer> => {
  const logoDataUri = readLogoDataUri()
  const extractedAt = args.extractedAt ?? new Date()
  const periodLabel = `${formatDate(args.from)} a ${formatDate(args.to)}`
  const extractedAtLabel = dateTimeFormatter.format(extractedAt)
  const rows = flattenRows(args.items)
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.classifierName)}</td>
        <td>${escapeHtml(formatDate(row.date))}</td>
        <td>${escapeHtml(row.farmName)}</td>
        <td class="mono">${escapeHtml(row.osId)}</td>
        <td class="right">${escapeHtml(tonsFormatter.format(row.tons))}</td>
        <td class="right">${escapeHtml(integerFormatter.format(row.rneCount))}</td>
      </tr>`,
    )
    .join('')
  const classifierSummaryRows = args.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.classifierName)}</td>
        <td class="right">${escapeHtml(integerFormatter.format(item.daysWorked))}</td>
        <td class="right">${escapeHtml(integerFormatter.format(item.volumeDays))}</td>
        <td class="right">${escapeHtml(integerFormatter.format(item.rneDays))}</td>
        <td class="right">${escapeHtml(tonsFormatter.format(item.tons))}</td>
        <td class="right">${escapeHtml(integerFormatter.format(item.rneCount))}</td>
        <td class="right">${escapeHtml(integerFormatter.format(item.osCount))}</td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Dias trabalhados</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, sans-serif; color: #17201a; }
        header { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 2px solid #26432b; padding-bottom: 12px; margin-bottom: 18px; }
        .brand { display: flex; align-items: center; gap: 14px; }
        .logo { width: 142px; height: auto; display: block; }
        .header-info { min-width: 220px; text-align: right; color: #5f6b63; font-size: 11px; line-height: 1.45; }
        .header-info strong { display: block; color: #26432b; font-size: 12px; }
        .header-info div + div { margin-top: 4px; }
        h1 { margin: 0; font-size: 22px; color: #26432b; }
        .meta { color: #5f6b63; font-size: 12px; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #26432b; color: white; text-align: left; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; padding: 8px; }
        td { border-bottom: 1px solid #e5e7eb; padding: 8px; font-size: 11px; vertical-align: top; }
        tbody tr:nth-child(even) { background: #f6f8f7; }
        .right { text-align: right; white-space: nowrap; }
        .mono { font-family: "Courier New", monospace; white-space: nowrap; }
        .summary { margin-top: 18px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
        .summary-card { border: 1px solid #d9e2dc; border-radius: 10px; padding: 10px; background: #f8faf9; }
        .summary-card span { display: block; color: #5f6b63; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
        .summary-card strong { display: block; margin-top: 4px; color: #26432b; font-size: 16px; }
        .section-title { margin: 18px 0 8px; font-size: 14px; color: #26432b; }
        .compact td { font-size: 10.5px; padding: 7px 8px; }
      </style>
    </head>
    <body>
      <header>
        <div class="brand">
          ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="InspectCheck" />` : ''}
          <div>
            <h1>Dias trabalhados por classificador</h1>
            <div class="meta">Relatório consolidado - InspectCheck</div>
          </div>
        </div>
        <div class="header-info">
          <div>
            <strong>Período dos filtros</strong>
            ${escapeHtml(periodLabel)}
          </div>
          <div>
            <strong>Extraído em</strong>
            ${escapeHtml(extractedAtLabel)}
          </div>
        </div>
      </header>
      <table>
        <thead>
          <tr>
            <th>Classificador</th>
            <th>Data</th>
            <th>Fazenda</th>
            <th>O.S.</th>
            <th class="right">Volume (t)</th>
            <th class="right">RNE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <h2 class="section-title">Resumo de diárias por colaborador</h2>
      <table class="compact">
        <thead>
          <tr>
            <th>Classificador</th>
            <th class="right">Diárias</th>
            <th class="right">Dias volume</th>
            <th class="right">Dias RNE</th>
            <th class="right">Volume (t)</th>
            <th class="right">RNE</th>
            <th class="right">O.S.</th>
          </tr>
        </thead>
        <tbody>${classifierSummaryRows}</tbody>
      </table>
      <section class="summary">
        <div class="summary-card"><span>Classificadores</span><strong>${escapeHtml(integerFormatter.format(args.totals.classifiers))}</strong></div>
        <div class="summary-card"><span>Dias únicos</span><strong>${escapeHtml(integerFormatter.format(args.totals.daysWorked))}</strong></div>
        <div class="summary-card"><span>Total por classificador</span><strong>${escapeHtml(integerFormatter.format(args.totals.totalClassifierDays))}</strong></div>
        <div class="summary-card"><span>Volume</span><strong>${escapeHtml(tonsFormatter.format(args.totals.tons))} t</strong></div>
        <div class="summary-card"><span>RNE</span><strong>${escapeHtml(integerFormatter.format(args.totals.rneCount))}</strong></div>
        <div class="summary-card"><span>O.S.</span><strong>${escapeHtml(integerFormatter.format(args.totals.osCount))}</strong></div>
      </section>
    </body>
  </html>`

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
