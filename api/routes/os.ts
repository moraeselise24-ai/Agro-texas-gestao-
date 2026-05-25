import { Router, type Request, type Response } from 'express'
import { listOsRecords } from '../repositories/osRepo.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const from = String(req.query.from ?? '')
  const to = String(req.query.to ?? '')
  const q = req.query.q ? String(req.query.q) : undefined
  const client = req.query.client ? String(req.query.client) : undefined
  const point = req.query.point ? String(req.query.point) : undefined
  const typeRaw = req.query.type ? String(req.query.type) : 'all'
  const type = ['all', 'loads', 'rne'].includes(typeRaw)
    ? (typeRaw as 'all' | 'loads' | 'rne')
    : 'all'
  const page = Number(req.query.page ?? 1)
  const pageSize = Number(req.query.pageSize ?? 25)

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }

  const result = await listOsRecords({
    from,
    to,
    q,
    client,
    point,
    type,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 200) : 25,
  })

  res.status(200).json({ success: true, ...result })
})

export default router
