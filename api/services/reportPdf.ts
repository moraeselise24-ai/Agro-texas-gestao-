import fs from 'fs'
import path from 'path'
const __dirname = process.cwd()

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const formatReportDate = (value: string | null | undefined): string => {
  if (!value) return ''
  const [y, m, d] = value.split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

export const reportDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Cuiaba',
})

export const readReportLogoDataUri = (): string | null => {
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

export const buildReportHeader = (args: {
  title: string
  subtitle?: string
  from?: string
  to?: string
  extractedAt?: Date
}): string => {
  const logoDataUri = readReportLogoDataUri()
  const periodLabel = args.from && args.to ? `${formatReportDate(args.from)} a ${formatReportDate(args.to)}` : 'Não informado'
  const extractedAtLabel = reportDateTimeFormatter.format(args.extractedAt ?? new Date())

  return `<header>
    <div class="brand">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="InspectCheck" />` : ''}
      <div>
        <h1>${escapeHtml(args.title)}</h1>
        <div class="meta">${escapeHtml(args.subtitle ?? 'Relatório consolidado - InspectCheck')}</div>
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
  </header>`
}

export const buildSummaryCards = (cards: Array<{ label: string; value: string }>): string =>
  `<section class="summary" style="grid-template-columns: repeat(${Math.min(Math.max(cards.length, 1), 6)}, 1fr);">
    ${cards
      .map(
        (card) => `<div class="summary-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </div>`,
      )
      .join('')}
  </section>`

export const reportCss = `
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
  .summary { margin-top: 18px; display: grid; gap: 10px; }
  .summary-card { border: 1px solid #d9e2dc; border-radius: 10px; padding: 10px; background: #f8faf9; }
  .summary-card span { display: block; color: #5f6b63; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .summary-card strong { display: block; margin-top: 4px; color: #26432b; font-size: 16px; }
  .section-title { margin: 18px 0 8px; font-size: 14px; color: #26432b; }
  .compact td { font-size: 10.5px; padding: 7px 8px; }
`
