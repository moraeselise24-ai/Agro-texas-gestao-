import { Router, type Request, type Response } from 'express'
import {
  discoverLaudosColumns,
  discoverOsColumns,
  loadCollectorConfigFromEnv,
} from '../collector/classificCollector.js'
import { runCollectJob } from '../services/runCollect.js'

const router = Router()

router.get('/discover', async (_req: Request, res: Response): Promise<void> => {
  const cfg = loadCollectorConfigFromEnv()
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Collector not configured' })
    return
  }

  try {
    const discovery = await discoverOsColumns(cfg)
    res.status(200).json({
      success: true,
      discovery,
      hint: 'Use discovery.suggested.embarcadoHoje como CLASSIFIC_OS_EMBARCADO_HOJE_COL no Fly.',
    })
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Discover failed',
    })
  }
})

router.get('/discover-laudos', async (_req: Request, res: Response): Promise<void> => {
  const cfg = loadCollectorConfigFromEnv()
  if (!cfg) {
    res.status(400).json({ success: false, error: 'Collector not configured' })
    return
  }

  try {
    const discovery = await discoverLaudosColumns(cfg)
    res.status(200).json({ success: true, discovery })
  } catch (e) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Discover laudos failed',
    })
  }
})

router.post('/run', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await runCollectJob()
    res.status(200).json({ success: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Collector failed'
    const status = message === 'Collector not configured' ? 400 : 500
    res.status(status).json({ success: false, error: message })
  }
})

export default router
