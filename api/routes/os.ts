import { Router, type Request, type Response } from 'express'
import { getBillingRules } from '../repositories/configRepo.js'
import { listOsRecords, listOsRecordsByOsId } from '../repositories/osRepo.js'
import { estimateRevenueForRecords } from '../services/billing.js'
import { filterMovementRecords, isRneRecord } from '../services/movement.js'
import { dedupeVolumeByOsDay } from '../services/volume.js'

const router = Router()

router.get('/:osId/details', async (req: Request, res: Response): Promise<void> => {
  try {
    const osId = String(req.params.osId ?? '').trim()
    const from = req.query.from ? String(req.query.from) : undefined
    const to = req.query.to ? String(req.query.to) : undefined

    if (!osId) {
      res.status(400).json({ success: false, error: 'Missing osId' })
      return
    }

    const records = await listOsRecordsByOsId({ osId, from, to })
    const movementRecords = filterMovementRecords(records)
    const volumeRecords = dedupeVolumeByOsDay(movementRecords)
    const rules = await getBillingRules()
    const revenue = estimateRevenueForRecords(volumeRecords, rules, movementRecords)
    const tonsTotal = volumeRecords.reduce((sum, record) => sum + (Number(record.tons ?? 0) || 0), 0)
    const rneCount = records.filter((record) => isRneRecord(record)).length
    const first = records[0] ?? null

    res.status(200).json({
      success: true,
      detail: {
        osId,
        clientName: first?.clientName ?? null,
        embarkPoint: first?.embarkPoint ?? null,
        tonsTotal,
        rneCount,
        revenueEstimatedBRL: revenue.revenueEstimatedBRL,
        dailyFeeCount: revenue.dailyFeeCount,
        records,
      },
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar detalhes da OS',
    })
  }
})

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
