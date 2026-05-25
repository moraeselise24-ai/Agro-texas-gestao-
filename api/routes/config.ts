import { Router, type Request, type Response } from 'express'
import { getBillingRules, updateBillingRules } from '../repositories/configRepo.js'
import type { BillingRules } from '../types.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const rules = await getBillingRules()
  res.status(200).json({ success: true, rules })
})

router.put('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Partial<BillingRules>
  const next: BillingRules = {
    dailyFeeBRL: Number(body.dailyFeeBRL ?? 400),
    baseTariffBRLPerTon: Number(body.baseTariffBRLPerTon ?? 2),
    minCadenceTons: Number(body.minCadenceTons ?? 200),
    excessMultiplier: Number(body.excessMultiplier ?? 2),
  }
  await updateBillingRules(next)
  res.status(200).json({ success: true })
})

export default router

