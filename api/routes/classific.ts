import { Router, type Request, type Response } from 'express'
import { collectOsAtivas } from '../collector/osAtivasCollector.js'
import { collectOsDetalhe } from '../collector/osDetalheCollector.js'

const router = Router()

router.get('/os-ativas', async (req: Request, res: Response): Promise<void> => {
  try {
    const includeClosedRaw = String(req.query.includeClosed ?? '')
    const includeClosed = includeClosedRaw === '1' || includeClosedRaw.toLowerCase() === 'true'

    const items = await collectOsAtivas()
    const filtered = includeClosed
      ? items
      : items.filter((i) => String(i.status ?? '').toLowerCase().includes('aberto'))

    res.status(200).json({ success: true, items: filtered })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar O.S. ativas',
    })
  }
})

router.get('/os-detalhe/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const detalhe = await collectOsDetalhe(id)
    res.status(200).json({ success: true, detalhe })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao carregar detalhe da O.S.',
    })
  }
})

export default router
