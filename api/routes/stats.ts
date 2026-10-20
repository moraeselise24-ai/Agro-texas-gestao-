import { Router, type Request, type Response } from 'express'
import { getBillingRules } from '../repositories/configRepo.js'
import { listOsRecordsForExport } from '../repositories/osRepo.js'
import { buildStats } from '../services/stats.js'
import { getRequestPermissions } from '../utils/requestUser.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = String(req.query.from ?? '')
    const to = String(req.query.to ?? '')
    const q = req.query.q ? String(req.query.q) : undefined
    const client = req.query.client ? String(req.query.client) : undefined
    const point = req.query.point ? String(req.query.point) : undefined
    const contract = req.query.contract ? String(req.query.contract) : undefined
    const typeRaw = req.query.type ? String(req.query.type) : 'all'
    const type = ['all', 'loads', 'rne'].includes(typeRaw)
      ? (typeRaw as 'all' | 'loads' | 'rne')
      : 'all'

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'Missing from/to' })
      return
    }

    const rules = await getBillingRules()
    const records = await listOsRecordsForExport({ from, to, q, client, point, contract, type })
    const stats = buildStats(records, rules, { from, to })
    const permissions = await getRequestPermissions(req)

    if (!permissions.canAccessFaturamento) {
      stats.kpis.revenueEstimatedBRL = 0
      stats.kpis.revenueDailySeries = []
      stats.breakdowns.byClient = stats.breakdowns.byClient.map((item) => ({
        ...item,
        revenueEstimatedBRL: 0,
      }))
      stats.breakdowns.byEmbarkPoint = stats.breakdowns.byEmbarkPoint.map((item) => ({
        ...item,
        revenueEstimatedBRL: 0,
      }))
    }

    res.status(200).json({ success: true, stats })
  } catch (error) {
    console.error('[api/stats]', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao carregar estatísticas',
    })
  }
})

export default router
