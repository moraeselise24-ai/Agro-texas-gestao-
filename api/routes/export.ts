import { Router, type Request, type Response } from 'express'
import { listOsRecordsForExport, type OsRecordTypeFilter } from '../repositories/osRepo.js'
import { buildOsPdf, buildOsXlsx } from '../services/osExport.js'

const router = Router()

const parseType = (value: unknown): OsRecordTypeFilter => {
  const raw = String(value ?? 'all')
  return raw === 'loads' || raw === 'rne' ? raw : 'all'
}

const parseFilters = (body: any): {
  from: string
  to: string
  q?: string
  client?: string
  point?: string
  contract?: string
  type: OsRecordTypeFilter
  sort: 'date' | 'contract'
} => ({
  from: String(body?.from ?? ''),
  to: String(body?.to ?? ''),
  q: body?.q ? String(body.q) : undefined,
  client: body?.client ? String(body.client) : undefined,
  point: body?.point ? String(body.point) : undefined,
  contract: body?.contract ? String(body.contract) : undefined,
  type: parseType(body?.type),
  sort: body?.sort === 'contract' ? 'contract' : 'date',
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { from, to, q, client, point, contract, type, sort } = parseFilters(req.body)

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }

  const records = await listOsRecordsForExport({ from, to, q, client, point, contract, type, sort })

  const headers = ['id', 'osId', 'contractNumber', 'date', 'clientName', 'embarkPoint', 'plate', 'tons', 'rne', 'status']
  const rows = records.map((r) =>
    [
      r.id,
      r.osId ?? '',
      r.contractNumber ?? '',
      r.date,
      r.clientName,
      r.embarkPoint,
      r.plate ?? '',
      String(r.tons),
      r.rne == null ? '' : String(r.rne),
      r.status ?? '',
    ]
      .map((v) => `"${String(v).split('"').join('""')}"`)
      .join(','),
  )

  const csv = `${headers.join(',')}\n${rows.join('\n')}\n`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="export_${type}_${from}_${to}.csv"`)
  res.status(200).send(csv)
})

router.post('/xlsx', async (req: Request, res: Response): Promise<void> => {
  const { from, to, q, client, point, contract, type, sort } = parseFilters(req.body)
  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }
  const records = await listOsRecordsForExport({ from, to, q, client, point, contract, type, sort })
  const buf = await buildOsXlsx(records)
  res.setHeader('Content-Disposition', `attachment; filename="relatorio_${type}_${from}_${to}.xlsx"`)
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  res.status(200).send(buf)
})

router.post('/pdf', async (req: Request, res: Response): Promise<void> => {
  const { from, to, q, client, point, contract, type, sort } = parseFilters(req.body)
  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }
  const records = await listOsRecordsForExport({ from, to, q, client, point, contract, type, sort })
  const labels: Record<OsRecordTypeFilter, string> = {
    all: 'OS e registros',
    loads: 'Cargas embarcadas',
    rne: 'Registros RNE',
  }
  const buf = await buildOsPdf(records, { title: labels[type], from, to })
  res.setHeader('Content-Disposition', `attachment; filename="relatorio_${type}_${from}_${to}.pdf"`)
  res.setHeader('Content-Type', 'application/pdf')
  res.status(200).send(buf)
})

export default router
