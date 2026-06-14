import type { OsRecord } from '../types.js'
import {
  buildReportHeader,
  buildSummaryCards,
  escapeHtml,
  formatReportDate,
  reportCss,
} from './reportPdf.js'

const formatTons = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)

export const buildPlateOccurrencesXlsx = async (args: {
  items: OsRecord[]
  summary: {
    plates: number
    occurrences: number
    osCount: number
    tons: number
    rneCount: number
  }
}): Promise<Buffer> => {
  const mod = (await import('exceljs')) as unknown as { default?: any }
  const ExcelJS = mod.default ?? (mod as any)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Ocorrencias de placas')

  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Placa', key: 'plate', width: 16 },
    { header: 'OS', key: 'osId', width: 18 },
    { header: 'Cliente', key: 'clientName', width: 34 },
    { header: 'Ponto/Fazenda', key: 'embarkPoint', width: 34 },
    { header: 'Classificador', key: 'classifierName', width: 24 },
    { header: 'Volume (t)', key: 'tons', width: 14 },
    { header: 'RNE', key: 'rne', width: 10 },
    { header: 'Status', key: 'status', width: 16 },
  ]

  for (const item of args.items) {
    sheet.addRow({
      date: item.date,
      plate: item.plate ?? '',
      osId: item.osId ?? item.id,
      clientName: item.clientName,
      embarkPoint: item.embarkPoint,
      classifierName: item.classifierName ?? '',
      tons: item.tons,
      rne: item.rne ?? '',
      status: item.status ?? '',
    })
  }

  sheet.addRow({})
  sheet.addRow({ date: 'Placas', plate: args.summary.plates })
  sheet.addRow({ date: 'Ocorrências', plate: args.summary.occurrences })
  sheet.addRow({ date: 'O.S.', plate: args.summary.osCount })
  sheet.addRow({ date: 'Volume (t)', plate: args.summary.tons })
  sheet.addRow({ date: 'RNE', plate: args.summary.rneCount })

  sheet.getRow(1).font = { bold: true }
  sheet.getColumn('tons').numFmt = '#,##0.00'

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return Buffer.from(buf)
}

export const buildPlateOccurrencesPdf = async (args: {
  items: OsRecord[]
  summary: {
    plates: number
    occurrences: number
    osCount: number
    tons: number
    rneCount: number
  }
  from: string
  to: string
  extractedAt?: Date
}): Promise<Buffer> => {
  const rows = args.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(formatReportDate(item.date))}</td>
        <td class="mono">${escapeHtml(item.plate ?? '')}</td>
        <td class="mono">${escapeHtml(item.osId ?? item.id)}</td>
        <td>${escapeHtml(item.clientName)}</td>
        <td>${escapeHtml(item.embarkPoint)}</td>
        <td>${escapeHtml(item.classifierName ?? '')}</td>
        <td class="right">${escapeHtml(formatTons(item.tons))}</td>
        <td class="right">${escapeHtml(item.rne == null ? '' : String(item.rne))}</td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Ocorrências de placas</title>
      <style>
        ${reportCss}
      </style>
    </head>
    <body>
      ${buildReportHeader({
        title: 'Ocorrências de placas',
        subtitle: 'Relatório consolidado - InspectCheck',
        from: args.from,
        to: args.to,
        extractedAt: args.extractedAt,
      })}
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Placa</th>
            <th>O.S.</th>
            <th>Cliente</th>
            <th>Fazenda/Ponto</th>
            <th>Classificador</th>
            <th class="right">Volume (t)</th>
            <th class="right">RNE</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${buildSummaryCards([
        { label: 'Placas', value: String(args.summary.plates) },
        { label: 'Ocorrências', value: String(args.summary.occurrences) },
        { label: 'O.S.', value: String(args.summary.osCount) },
        { label: 'Volume', value: `${formatTons(args.summary.tons)} t` },
        { label: 'RNE', value: String(args.summary.rneCount) },
      ])}
    </body>
  </html>`

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })
    return Buffer.from(
      await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
      }),
    )
  } finally {
    await page.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
