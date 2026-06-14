import { Router, type Request, type Response } from 'express'
import { getBillingRules } from '../repositories/configRepo.js'
import { listOsRecordsForExport } from '../repositories/osRepo.js'
import { buildStats } from '../services/stats.js'

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

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }

  const rules = await getBillingRules()
  const records = await listOsRecordsForExport({ from, to, q, client, point, type })
  const stats = buildStats(records, rules, { from, to })

  res.status(200).json({ success: true, stats })
})

export default router
