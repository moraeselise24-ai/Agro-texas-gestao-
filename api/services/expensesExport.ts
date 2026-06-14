import type { Expense } from '../types.js'
import {
  buildReportHeader,
  buildSummaryCards,
  escapeHtml,
  formatReportDate,
  reportCss,
} from './reportPdf.js'

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const statusLabel = (status: Expense['status']): string => {
  const labels: Record<Expense['status'], string> = {
    agendada: 'Agendada',
    a_pagar: 'A pagar',
    paga: 'Paga',
    cancelada: 'Cancelada',
  }
  return labels[status] ?? status
}

export const buildExpensesXlsx = async (args: {
  items: Expense[]
  totalAmountBRL: number
}): Promise<Buffer> => {
  const mod = (await import('exceljs')) as unknown as { default?: any }
  const ExcelJS = mod.default ?? (mod as any)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Despesas')

  sheet.columns = [
    { header: 'Data da despesa', key: 'date', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Categoria', key: 'category', width: 22 },
    { header: 'Descrição', key: 'description', width: 34 },
    { header: 'Fornecedor', key: 'supplier', width: 24 },
    { header: 'Vencimento', key: 'dueDate', width: 14 },
    { header: 'Pagar em', key: 'scheduledPaymentDate', width: 14 },
    { header: 'Pago em', key: 'paidAt', width: 14 },
    { header: 'Pagamento', key: 'paymentMethod', width: 16 },
    { header: 'Documento', key: 'documentNumber', width: 18 },
    { header: 'Recorrente', key: 'recurring', width: 16 },
    { header: 'Valor', key: 'amountBRL', width: 16 },
    { header: 'Observações', key: 'notes', width: 34 },
  ]

  for (const item of args.items) {
    sheet.addRow({
      date: item.date,
      status: statusLabel(item.status),
      category: item.category,
      description: item.description,
      supplier: item.supplier ?? '',
      dueDate: item.dueDate ?? '',
      scheduledPaymentDate: item.scheduledPaymentDate ?? '',
      paidAt: item.paidAt ?? '',
      paymentMethod: item.paymentMethod ?? '',
      documentNumber: item.documentNumber ?? '',
      recurring: item.isRecurring ? item.recurrenceFrequency ?? 'Sim' : 'Não',
      amountBRL: item.amountBRL,
      notes: item.notes ?? '',
    })
  }

  sheet.addRow({})
  sheet.addRow({ description: 'Total', amountBRL: args.totalAmountBRL })
  sheet.getRow(1).font = { bold: true }
  sheet.getColumn('amountBRL').numFmt = '"R$" #,##0.00'

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return Buffer.from(buf)
}

export const buildExpensesPdf = async (args: {
  items: Expense[]
  totalAmountBRL: number
  title?: string
  from?: string
  to?: string
  extractedAt?: Date
}): Promise<Buffer> => {
  const paidTotal = args.items
    .filter((item) => item.status === 'paga')
    .reduce((sum, item) => sum + item.amountBRL, 0)
  const pendingTotal = args.items
    .filter((item) => item.status !== 'paga' && item.status !== 'cancelada')
    .reduce((sum, item) => sum + item.amountBRL, 0)
  const rows = args.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(formatReportDate(item.date))}</td>
        <td>${escapeHtml(statusLabel(item.status))}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(formatReportDate(item.dueDate))}</td>
        <td>${escapeHtml(formatReportDate(item.scheduledPaymentDate))}</td>
        <td class="right">${escapeHtml(brl.format(item.amountBRL))}</td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Despesas</title>
      <style>
        ${reportCss}
      </style>
    </head>
    <body>
      ${buildReportHeader({
        title: args.title ?? 'Despesas da operação',
        from: args.from,
        to: args.to,
        extractedAt: args.extractedAt,
      })}
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Status</th>
            <th>Categoria</th>
            <th>Descrição</th>
            <th>Venc.</th>
            <th>Pagar em</th>
            <th class="right">Valor</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${buildSummaryCards([
        { label: 'Registros', value: String(args.items.length) },
        { label: 'Total filtrado', value: brl.format(args.totalAmountBRL) },
        { label: 'Pago', value: brl.format(paidTotal) },
        { label: 'Em aberto', value: brl.format(pendingTotal) },
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
