import { Router, type Request, type Response } from 'express'
import { upsertOsRecords } from '../repositories/osRepo.js'
import type { OsRecord } from '../types.js'
import { normalizeDateToIso } from '../utils/normalizeDate.js'

const router = Router()

type CsvImportBody = {
  contentBase64: string
  delimiter?: string
}

const parseCsv = (text: string, delimiter: string): Array<Record<string, string>> => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const headers = lines[0].split(delimiter).map((h) => h.trim())
  const rows: Array<Record<string, string>> = []
  for (const line of lines.slice(1)) {
    const cols = line.split(delimiter)
    const row: Record<string, string> = {}
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = (cols[i] ?? '').trim()
    }
    rows.push(row)
  }
  return rows
}

const toNumber = (v: string): number => {
  const normalized = v.replace(/\./g, '').replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

router.post('/csv', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<CsvImportBody>
  const contentBase64 = String(body.contentBase64 ?? '')
  const delimiter = String(body.delimiter ?? ';')

  if (!contentBase64) {
    res.status(400).json({ success: false, error: 'Missing contentBase64' })
    return
  }

  const csv = Buffer.from(contentBase64, 'base64').toString('utf-8')
  const parsed = parseCsv(csv, delimiter)

  const records: OsRecord[] = parsed
    .map((r) => {
      const id = r.id || r.ID || r.os || r.OS || ''
      const osId = r.osId || r.os_id || r['nº os'] || r['numero os'] || r.numeroOs || ''
      const date = r.date || r.data || r.Data || ''
      const clientName = r.clientName || r.cliente || r.Cliente || ''
      const embarkPoint = r.embarkPoint || r.ponto || r.pontoEmbarque || r['ponto de embarque'] || ''
      const tonsRaw = r.tons || r.toneladas || r.Toneladas || ''
      const rneRaw = r.rne || r.RNE || ''
      const status = r.status || r.Status || null

      return {
        id: String(id),
        osId: osId ? String(osId) : null,
        date: normalizeDateToIso(date),
        clientName: String(clientName),
        embarkPoint: String(embarkPoint),
        tons: toNumber(String(tonsRaw)),
        rne: rneRaw ? toNumber(String(rneRaw)) : null,
        status: status == null ? null : String(status),
      }
    })
    .filter((r) => r.id && r.date && r.clientName && r.embarkPoint)

  await upsertOsRecords(records)

  res.status(200).json({ success: true, imported: records.length })
})

export default router
