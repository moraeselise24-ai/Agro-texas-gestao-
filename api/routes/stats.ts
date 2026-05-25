import { Router, type Request, type Response } from 'express'
import { getBillingRules } from '../repositories/configRepo.js'
import { listOsRecordsInRange } from '../repositories/osRepo.js'
import { buildStats } from '../services/stats.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const from = String(req.query.from ?? '')
  const to = String(req.query.to ?? '')

  if (!from || !to) {
    res.status(400).json({ success: false, error: 'Missing from/to' })
    return
  }

  const rules = await getBillingRules()
  const records = await listOsRecordsInRange(from, to)
  const stats = buildStats(records, rules, { from, to })

  res.status(200).json({ success: true, stats })
})

export default router

