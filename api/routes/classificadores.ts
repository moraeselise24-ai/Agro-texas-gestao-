import { Router, type Request, type Response } from 'express'
import { collectClassificadores } from '../collector/classificadoresCollector.js'
import { listClassificadores, upsertClassificadores } from '../repositories/classificadoresRepo.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const onlyActiveRaw = String(req.query.onlyActive ?? '')
    const onlyActive = onlyActiveRaw === '1' || onlyActiveRaw.toLowerCase() === 'true'
    const items = await listClassificadores({ onlyActive })
    res.status(200).json({ success: true, items })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar classificadores',
    })
  }
})

router.post('/sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await collectClassificadores()
    await upsertClassificadores(items)
    res.status(200).json({ success: true, synced: items.length })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao sincronizar classificadores',
    })
  }
})

export default router

