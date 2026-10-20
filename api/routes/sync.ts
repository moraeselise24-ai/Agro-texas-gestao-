import { Router, type Request, type Response } from 'express'
import { collectClassificadores } from '../collector/classificadoresCollector.js'
import { upsertClassificadores } from '../repositories/classificadoresRepo.js'
import { runCollectJob } from '../services/runCollect.js'
import { isHostedPanelRuntime, rejectHostedCollector } from '../utils/collectorRuntime.js'

const router = Router()

router.post('/run', async (_req: Request, res: Response): Promise<void> => {
  if (isHostedPanelRuntime()) {
    rejectHostedCollector(res)
    return
  }
  try {
    const collectResult = await runCollectJob().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'Coleta já em execução') return { skipped: true, reason: msg } as const
      throw e
    })

    const classificadores = await collectClassificadores()
    await upsertClassificadores(classificadores)

    res.status(200).json({
      success: true,
      collect: collectResult,
      classificadores: { synced: classificadores.length },
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao sincronizar',
    })
  }
})

export default router
