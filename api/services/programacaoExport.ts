import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Programacao } from '../types.js'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))

const getLogoDataUri = (): string => {
  const candidates = [
    path.join(moduleDir, '..', '..', 'public', 'logo2.png'),
    path.join(moduleDir, '..', '..', 'imagem', 'logo2.png'),
    path.join(moduleDir, '..', '..', 'public', 'logo.png'),
    path.join(moduleDir, '..', '..', 'imagem', 'logo.png'),
  ]
  for (const logoPath of candidates) {
    if (!fs.existsSync(logoPath)) continue
    const buf = fs.readFileSync(logoPath)
    return `data:image/png;base64,${buf.toString('base64')}`
  }
  return ''
}

const toNumberSafe = (v: number | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const EMISSION_TIME_ZONE = 'America/Cuiaba'

const formatBrDate = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

const formatBrDateTime = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: EMISSION_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')} — ${get('hour')}:${get('minute')}`
}

const formatBrKg = (value: number | null | undefined): string => {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n))
}

const escapeHtml = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const normalizePointKeyPart = (value: string | null | undefined): string =>
  String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

const getTechnicalPointKey = (item: Programacao['itens'][number]): string | null => {
  const origin = normalizePointKeyPart(item.localEmbarque)
  if (!origin) return null

  const client = normalizePointKeyPart(item.cliente)
  if (client) return `${origin}|CLIENTE:${client}`

  const os = normalizePointKeyPart(item.osId)
  return os ? `${origin}|OS:${os}` : origin
}

const getEffectiveRemanescenteKg = (item: Programacao['itens'][number]): number | null => {
  const lote = Number(item.volumeOs ?? 0)
  const embarcados = Number(item.volumeEmbarcado ?? 0)
  const remanescente = Number(item.volumeRemanescente ?? 0)

  if (lote > 0 && embarcados <= 0 && remanescente <= 0) return lote
  if (item.volumeRemanescente == null) return null
  return item.volumeRemanescente
}

const iconSvg = (name: string, className = 'icon'): string => {
  const attrs = `class="${className}" viewBox="0 0 24 24" aria-hidden="true"`
  const common =
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
  switch (name) {
    case 'truck':
      return `<svg ${attrs} ${common}><path d="M3 7h11v9H3z"/><path d="M14 10h3.8l2.2 3v3h-6z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17" cy="18" r="1.7"/></svg>`
    case 'operator':
      return `<svg ${attrs} ${common}><path d="M7 9a5 5 0 0 1 10 0"/><path d="M6 9h12"/><path d="M8 12a4 4 0 0 0 8 0"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`
    case 'calendar':
      return `<svg ${attrs} ${common}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>`
    case 'clipboard':
      return `<svg ${attrs} ${common}><path d="M9 4h6l1 2h3v15H5V6h3z"/><path d="M9 4h6v4H9z"/><path d="M8 12h8M8 16h6"/></svg>`
    case 'map':
      return `<svg ${attrs} ${common}><path d="M12 21s7-4.5 7-11a7 7 0 1 0-14 0c0 6.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`
    case 'factory':
      return `<svg ${attrs} ${common}><path d="M3 21V9l6 4V9l6 4V7h6v14z"/><path d="M7 17h1M11 17h1M15 17h1M18 11h1"/></svg>`
    case 'scale':
      return `<svg ${attrs} ${common}><path d="M12 3v18M6 6h12M7 6l-4 7h8zM17 6l-4 7h8z"/></svg>`
    case 'package':
      return `<svg ${attrs} ${common}><path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>`
    case 'grain':
      return `<svg ${attrs} ${common}><path d="M12 20V5"/><path d="M12 8c-4 0-6-2-7-5 4 0 6 2 7 5z"/><path d="M12 12c4 0 6-2 7-5-4 0-6 2-7 5z"/><path d="M12 16c-4 0-6-2-7-5 4 0 6 2 7 5z"/></svg>`
    case 'corn':
      return `<svg ${attrs} ${common}><path d="M12 3c3 3 4 6 4 10 0 5-2 8-4 8s-4-3-4-8c0-4 1-7 4-10z"/><path d="M9 9h6M8 13h8M9 17h6"/><path d="M7 21c1.5-3 3-4 5-4s3.5 1 5 4"/></svg>`
    case 'route':
      return `<svg ${attrs} ${common}><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h5a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h5"/></svg>`
    default:
      return `<svg ${attrs} ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>`
  }
}

export const buildProgramacaoHtml = (programacao: Programacao): string => {
  const now = new Date()
  const logoDataUri = getLogoDataUri()
  const ref = `PROG-${programacao.data.replace(/-/g, '')}`
  const importSourceLabel = programacao.importSourceDate
    ? `Importada de ${formatBrDate(programacao.importSourceDate)}`
    : ''
  const totalPontos = new Set(
    programacao.itens.map(getTechnicalPointKey).filter((p): p is string => Boolean(p)),
  ).size
  const totalVolumeOs = programacao.itens.reduce((acc, i) => acc + (Number(i.volumeOs ?? 0) || 0), 0)
  const totalVolumeEmbarcado = programacao.itens.reduce(
    (acc, i) => acc + (Number(i.volumeEmbarcado ?? 0) || 0),
    0,
  )
  const totalVolumeRemanescente = programacao.itens.reduce(
    (acc, i) => acc + (Number(getEffectiveRemanescenteKg(i) ?? 0) || 0),
    0,
  )

  const rowsHtml = programacao.itens
    .map((i) => {
      const cells = [
        formatBrDate(programacao.data),
        i.classificadorNome,
        i.cliente ?? '',
        i.osId,
        i.produto ?? '',
        i.localEmbarque,
        i.destino ?? '',
        i.volumeOs == null ? '' : formatBrKg(i.volumeOs),
        i.volumeEmbarcado == null ? '' : formatBrKg(i.volumeEmbarcado),
        getEffectiveRemanescenteKg(i) == null ? '' : formatBrKg(getEffectiveRemanescenteKg(i)),
      ].map((c) => escapeHtml(String(c ?? '')))

      return `<tr>
        <td class="td mono">${cells[0]}</td>
        <td class="td mono">${cells[1]}</td>
        <td class="td mono">${cells[2]}</td>
        <td class="td mono">${cells[3]}</td>
        <td class="td mono">${cells[4]}</td>
        <td class="td mono">${cells[5]}</td>
        <td class="td mono">${cells[6]}</td>
        <td class="td mono right">${cells[7]}</td>
        <td class="td mono right">${cells[8]}</td>
        <td class="td mono right">${cells[9]}</td>
      </tr>`
    })
    .join('\n')

  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <title>Programação de Embarque</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          height: auto;
          min-height: 0;
        }
        body {
          font-family: "Hanken Grotesk", system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #191C1D;
          background: #FFFFFF;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .export-root {
          width: 100%;
          max-width: 277mm;
          margin: 0 auto;
          padding: 0;
          background: #FFFFFF;
        }
        .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
        .brand-logo {
          display: block;
          height: 52px;
          width: auto;
          max-width: 220px;
          object-fit: contain;
        }
        .doc-title { text-align: right; }
        .doc-title h2 {
          margin: 0;
          font-size: 20px;
          line-height: 28px;
          font-weight: 700;
          color: #26432B;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
        }
        .doc-title p { margin: 4px 0 0; font-size: 12px; color: #424842; }
        .divider { height: 2px; background: #26432B; opacity: 0.35; margin: 14px 0; }
        .title-icon {
          width: 30px;
          height: 30px;
          padding: 6px;
          border-radius: 999px;
          color: #26432B;
          background: #eef5ef;
          border: 1px solid #cfdad2;
        }
        .icon {
          width: 16px;
          height: 16px;
          flex: 0 0 auto;
        }

        .meta {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 16px;
          background: #F8F9FA;
          border: 1px solid #E9ECEF;
          border-radius: 8px;
          padding: 14px 16px;
          margin-bottom: 14px;
        }
        .meta-item {
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 10px;
        }
        .meta-icon,
        .summary-icon {
          display: grid;
          place-items: center;
          border-radius: 999px;
          color: #26432B;
          background: #eef5ef;
          border: 1px solid #d8e2da;
        }
        .meta-icon {
          width: 34px;
          height: 34px;
        }
        .meta .label {
          font-size: 11px;
          line-height: 14px;
          letter-spacing: 0.05em;
          font-weight: 700;
          color: #424842;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .meta .value { font-size: 13px; line-height: 18px; font-weight: 500; }
        .mono { font-variant-numeric: tabular-nums; }

        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        .th {
          background: #26432B;
          color: #FFFFFF;
          font-size: 11px;
          line-height: 14px;
          letter-spacing: 0.05em;
          font-weight: 700;
          text-transform: uppercase;
          padding: 8px 10px;
          border-bottom: 1px solid #E9ECEF;
          white-space: nowrap;
        }
        .th-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .th-icon {
          width: 13px;
          height: 13px;
          opacity: 0.9;
        }
        .td {
          padding: 8px 10px;
          border-bottom: 1px solid #E9ECEF;
          font-size: 11px;
          line-height: 15px;
          color: #191C1D;
          vertical-align: top;
        }
        tbody tr:nth-child(even) { background: #F8F9FA; }
        .right { text-align: right; }

        .note {
          margin-top: 8px;
          text-align: right;
          font-size: 11px;
          color: #6b7280;
          font-style: italic;
        }

        .summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 14px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .card {
          border: 1px solid #E9ECEF;
          border-radius: 8px;
          padding: 10px 12px;
          background: #FFFFFF;
          display: grid;
          grid-template-columns: 34px 1fr;
          align-items: center;
          gap: 10px;
          text-align: left;
        }
        .summary-icon {
          width: 34px;
          height: 34px;
        }
        .card .k {
          font-size: 11px;
          line-height: 14px;
          letter-spacing: 0.05em;
          font-weight: 700;
          color: #424842;
          text-transform: uppercase;
        }
        .card .v {
          margin-top: 4px;
          font-size: 18px;
          line-height: 24px;
          font-weight: 800;
          color: #26432B;
        }

        .doc-footer {
          margin-top: 16px;
          padding: 12px 16px;
          border-radius: 10px;
          background: linear-gradient(135deg, #f4f6f4 0%, #e8ede9 100%);
          border: 1px solid #d5ddd7;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .doc-footer-brand {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .doc-footer-name {
          font-weight: 800;
          font-size: 11px;
          color: #26432b;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .doc-footer-tag {
          font-size: 9px;
          color: #5c665e;
          letter-spacing: 0.06em;
        }
        .doc-footer-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .ref-pill {
          display: inline-block;
          padding: 5px 14px;
          border-radius: 999px;
          background: #26432b;
          color: #fff;
          font-weight: 700;
          font-size: 10px;
          letter-spacing: 0.06em;
        }
        .doc-footer-issued {
          font-size: 9px;
          color: #5c665e;
        }
        .doc-footer-copy {
          text-align: right;
          font-size: 9px;
          line-height: 1.4;
          color: #5c665e;
          min-width: 0;
        }
        .doc-footer-copy strong {
          display: block;
          font-size: 10px;
          color: #26432b;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <div class="export-root" id="export-root">
        <header class="row">
          <div>
            ${
              logoDataUri
                ? `<img class="brand-logo" src="${logoDataUri}" alt="InspectCheck" />`
                : '<div class="brand-logo" style="height:52px"></div>'
            }
          </div>
          <div class="doc-title">
            <h2>${iconSvg('truck', 'title-icon')}<span>PROGRAMAÇÃO DE EMBARQUE</span></h2>
            <p>Data programada: ${escapeHtml(formatBrDate(programacao.data))}</p>
          </div>
        </header>
        <div class="divider"></div>

        <section class="meta">
          <div class="meta-item">
            <div class="meta-icon">${iconSvg('calendar')}</div>
            <div>
              <div class="label">Data de emissão</div>
              <div class="value mono">${escapeHtml(formatBrDateTime(now))}</div>
            </div>
          </div>
          <div class="meta-item">
            <div class="meta-icon">${iconSvg('operator')}</div>
            <div>
              <div class="label">Responsável</div>
              <div class="value mono">${escapeHtml(programacao.responsavelNome?.trim() || '—')}</div>
            </div>
          </div>
          <div class="meta-item">
            <div class="meta-icon">${iconSvg('clipboard')}</div>
            <div>
              <div class="label">Referência</div>
              <div class="value mono">${escapeHtml(ref)}</div>
              ${
                importSourceLabel
                  ? `<div class="value mono" style="font-size:10px;color:#6b7280">${escapeHtml(importSourceLabel)}</div>`
                  : ''
              }
            </div>
          </div>
        </section>

        <main>
          <table>
            <thead>
              <tr>
                <th class="th"><span class="th-label">${iconSvg('calendar', 'th-icon')}DATA</span></th>
                <th class="th"><span class="th-label">${iconSvg('operator', 'th-icon')}CLASSIFICADOR</span></th>
                <th class="th"><span class="th-label">${iconSvg('factory', 'th-icon')}CLIENTE</span></th>
                <th class="th"><span class="th-label">${iconSvg('clipboard', 'th-icon')}O.S.</span></th>
                <th class="th"><span class="th-label">${iconSvg('grain', 'th-icon')}PRODUTO</span></th>
                <th class="th"><span class="th-label">${iconSvg('map', 'th-icon')}ORIGEM</span></th>
                <th class="th"><span class="th-label">${iconSvg('factory', 'th-icon')}DESTINO</span></th>
                <th class="th right"><span class="th-label">${iconSvg('package', 'th-icon')}VOL. O.S. (LOTE)</span></th>
                <th class="th right"><span class="th-label">${iconSvg('truck', 'th-icon')}EMBARCADOS</span></th>
                <th class="th right"><span class="th-label">${iconSvg('scale', 'th-icon')}REMANESCENTE</span></th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || ''}
            </tbody>
          </table>

          <div class="note">Relatório consolidado — InspectCheck</div>
        </main>

        <section class="summary">
          <div class="card">
            <div class="summary-icon">${iconSvg('map')}</div>
            <div>
              <div class="k">Total de pontos</div>
              <div class="v mono">${escapeHtml(formatBrKg(totalPontos))}</div>
            </div>
          </div>
          <div class="card">
            <div class="summary-icon">${iconSvg('package')}</div>
            <div>
              <div class="k">Volume O.S. (kg)</div>
              <div class="v mono">${escapeHtml(formatBrKg(totalVolumeOs))}</div>
            </div>
          </div>
          <div class="card">
            <div class="summary-icon">${iconSvg('truck')}</div>
            <div>
              <div class="k">Embarcados (kg)</div>
              <div class="v mono">${escapeHtml(formatBrKg(totalVolumeEmbarcado))}</div>
            </div>
          </div>
          <div class="card">
            <div class="summary-icon">${iconSvg('scale')}</div>
            <div>
              <div class="k">Remanescente (kg)</div>
              <div class="v mono">${escapeHtml(formatBrKg(totalVolumeRemanescente))}</div>
            </div>
          </div>
        </section>

        <footer class="doc-footer">
          <div class="doc-footer-brand">
            <span class="doc-footer-name">InspectCheck</span>
            <span class="doc-footer-tag">Programação de embarque</span>
          </div>
          <div class="doc-footer-center">
            <span class="ref-pill">${escapeHtml(ref)}</span>
            ${
              importSourceLabel
                ? `<span class="doc-footer-issued mono">${escapeHtml(importSourceLabel)}</span>`
                : ''
            }
            <span class="doc-footer-issued mono">Emitido em ${escapeHtml(formatBrDateTime(now))}</span>
          </div>
          <div class="doc-footer-copy">
            <strong>Documento interno</strong>
            © ${escapeHtml(String(now.getFullYear()))} InspectCheck<br />
            Uso restrito à operação
          </div>
        </footer>
      </div>
    </body>
  </html>`
}

/** PNG export: 3× pixel density (~300 DPI equivalent for A4 landscape). */
const PNG_DEVICE_SCALE = 3
const PNG_VIEWPORT_WIDTH = 1680

const renderExportDocument = async (
  html: string,
  media: 'print' | 'screen',
): Promise<{
  browser: Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>
  page: import('playwright').Page
  close: () => Promise<void>
}> => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.emulateMedia({ media })
  return {
    browser,
    page,
    close: async () => {
      await page.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    },
  }
}

const renderExportDocumentHiRes = async (
  html: string,
): Promise<{
  close: () => Promise<void>
  page: import('playwright').Page
}> => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    deviceScaleFactor: PNG_DEVICE_SCALE,
    viewport: { width: PNG_VIEWPORT_WIDTH, height: 1400 },
  })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.emulateMedia({ media: 'screen' })
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined)
      await browser.close().catch(() => undefined)
    },
  }
}

export const buildProgramacaoXlsx = async (programacao: Programacao): Promise<Buffer> => {
  const mod = (await import('exceljs')) as unknown as { default?: any }
  const ExcelJS = mod.default ?? (mod as any)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Programação')

  sheet.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Classificador', key: 'classificador', width: 28 },
    { header: 'Cliente', key: 'cliente', width: 36 },
    { header: 'Local de embarque', key: 'embarque', width: 22 },
    { header: 'O.S.', key: 'os', width: 16 },
    { header: 'Destino', key: 'destino', width: 22 },
    { header: 'Fazenda/Armazém', key: 'fazenda', width: 26 },
    { header: 'VOL. O.S. (Lote)', key: 'volOs', width: 18 },
    { header: 'Embarcados', key: 'volEmb', width: 16 },
    { header: 'Remanescente', key: 'volRem', width: 16 },
    { header: 'Produto', key: 'produto', width: 18 },
  ]

  for (const item of programacao.itens) {
    sheet.addRow({
      data: programacao.data,
      classificador: item.classificadorNome,
      cliente: item.cliente ?? '',
      embarque: item.localEmbarque,
      os: item.osId,
      destino: item.destino ?? '',
      fazenda: item.fazendaArmazem ?? '',
      volOs: toNumberSafe(item.volumeOs),
      volEmb: toNumberSafe(item.volumeEmbarcado),
      volRem: toNumberSafe(getEffectiveRemanescenteKg(item)),
      produto: item.produto ?? '',
    })
  }

  sheet.getRow(1).font = { bold: true }

  const buf = (await workbook.xlsx.writeBuffer()) as ArrayBuffer
  return Buffer.from(buf)
}

export const buildProgramacaoPdf = async (programacao: Programacao): Promise<Buffer> => {
  const html = buildProgramacaoHtml(programacao)
  const { page, close } = await renderExportDocument(html, 'print')

  try {
    const buf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    })
    return Buffer.from(buf)
  } finally {
    await close()
  }
}

export const buildProgramacaoPng = async (programacao: Programacao): Promise<Buffer> => {
  const html = buildProgramacaoHtml(programacao)
  const { page, close } = await renderExportDocumentHiRes(html)

  try {
    const root = page.locator('#export-root')
    await root.waitFor({ state: 'visible', timeout: 10000 })

    const box = await root.boundingBox()
    if (box) {
      const pad = 40
      const width = Math.max(Math.ceil(box.width) + pad, PNG_VIEWPORT_WIDTH)
      const height = Math.max(Math.ceil(box.height) + pad, 800)
      await page.setViewportSize({ width, height })
      await page.waitForTimeout(150)
    }

    const buf = await root.screenshot({
      type: 'png',
      scale: 'device',
      animations: 'disabled',
    })
    return Buffer.from(buf)
  } finally {
    await close()
  }
}
