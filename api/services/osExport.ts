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

export const buildOsXlsx = async (records: OsRecord[]): Promise<Buffer> => {
  const mod = (await import('exceljs')) as unknown as { default?: any }
  const ExcelJS = mod.default ?? (mod as any)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Registros')

  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Registro', key: 'id', width: 24 },
    { header: 'OS', key: 'osId', width: 18 },
    { header: 'Cliente', key: 'clientName', width: 34 },
    { header: 'Ponto de embarque', key: 'embarkPoint', width: 34 },
    { header: 'Classificador', key: 'classifierName', width: 24 },
    { header: 'Placa', key: 'plate', width: 14 },
    { header: 'Ton', key: 'tons', width: 14 },
    { header: 'RNE', key: 'rne', width: 10 },
    { header: 'Status', key: 'status', width: 16 },
  ]

  for (const record of records) {
    sheet.addRow({
      date: record.date,
      id: record.id,
      osId: record.osId ?? '',
      clientName: record.clientName,
      embarkPoint: record.embarkPoint,
      classifierName: record.classifierName ?? '',
      plate: record.plate ?? '',
      tons: record.tons,
      rne: record.rne ?? '',
      status: record.status ?? '',
    })
  }

  sheet.getRow(1).font = { bold: true }
  sheet.getColumn('tons').numFmt = '#,##0.00'

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return Buffer.from(buf)
}

export const buildOsPdf = async (
  records: OsRecord[],
  args: {
    title?: string
    from?: string
    to?: string
    extractedAt?: Date
  } = {},
): Promise<Buffer> => {
  const totalTons = records.reduce((sum, record) => sum + (Number(record.tons ?? 0) || 0), 0)
  const rneTotal = records.reduce((sum, record) => sum + (Number(record.rne ?? 0) || 0), 0)
  const osTotal = new Set(records.map((record) => record.osId ?? record.id).filter(Boolean)).size
  const title = args.title ?? 'OS e registros'
  const rows = records
    .map(
      (record) => `<tr>
        <td>${escapeHtml(formatReportDate(record.date))}</td>
        <td class="mono">${escapeHtml(record.osId ?? record.id)}</td>
        <td>${escapeHtml(record.clientName)}</td>
        <td>${escapeHtml(record.embarkPoint)}</td>
        <td>${escapeHtml(record.plate ?? '')}</td>
        <td class="right">${escapeHtml(formatTons(record.tons))}</td>
        <td class="right">${escapeHtml(record.rne == null ? '' : String(record.rne))}</td>
        <td>${escapeHtml(record.status ?? '')}</td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        ${reportCss}
        th { background: #26432b; color: white; text-align: left; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; padding: 7px; }
        td { border-bottom: 1px solid #e5e7eb; padding: 7px; font-size: 10px; vertical-align: top; }
      </style>
    </head>
    <body>
      ${buildReportHeader({
        title,
        subtitle: `${records.length} registro(s) - InspectCheck`,
        from: args.from,
        to: args.to,
        extractedAt: args.extractedAt,
      })}
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>OS</th>
            <th>Cliente</th>
            <th>Ponto</th>
            <th>Placa</th>
            <th class="right">Ton</th>
            <th class="right">RNE</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${buildSummaryCards([
        { label: 'Registros', value: String(records.length) },
        { label: 'O.S.', value: String(osTotal) },
        { label: 'Volume total', value: `${formatTons(totalTons)} t` },
        { label: 'RNE', value: String(rneTotal) },
      ])}
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
