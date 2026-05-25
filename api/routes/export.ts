import { Router, type Request, type Response } from 'express'
import { listOsRecordsForExport, type OsRecordTypeFilter } from '../repositories/osRepo.js'

const router = Router()

const parseType = (value: unknown): OsRecordTypeFilter => {
  const raw = String(value ?? 'all')
  return raw === 'loads' || raw === 'rne' ? raw : 'all'
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const from = String(req.body?.from ?? '')
  const to = String(req.body?.to ?? '')
  const q = req.body?.q ? String(req.body.q) : undefined
  const client = req.body?.client ? String(req.body.client) : undefined
  const point = req.body?.point ? String(req.body.point) : undefined
  const type = parseType(req.body?.type)

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }

  const records = await listOsRecordsForExport({ from, to, q, client, point, type })

  const headers = ['id', 'osId', 'date', 'clientName', 'embarkPoint', 'tons', 'rne', 'status']
  const rows = records.map((r) =>
    [
      r.id,
      r.osId ?? '',
      r.date,
      r.clientName,
      r.embarkPoint,
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

export default router
