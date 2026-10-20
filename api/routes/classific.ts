import { Router, type Request, type Response } from 'express'
import { collectOsAtivas } from '../collector/osAtivasCollector.js'
import { collectOsDetalhe } from '../collector/osDetalheCollector.js'
import { createClassificLaudo, type ClassificLaudoPayload } from '../services/classificLaudoBot.js'
import { changeClassificOsClassifier } from '../services/classificOsDistributionBot.js'
import { runCollectJob } from '../services/runCollect.js'

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

router.post('/os-classificador', async (req: Request, res: Response): Promise<void> => {
  try {
    const { osId, detailId, classifierName } = (req.body ?? {}) as { osId?: string; detailId?: string | null; classifierName?: string }
    const result = await changeClassificOsClassifier({
      osId: String(osId ?? '').trim(),
      detailId: detailId == null ? null : String(detailId).trim(),
      classifierName: String(classifierName ?? '').trim(),
    })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao alterar classificador da O.S.',
    })
  }
})

router.post('/laudos', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await createClassificLaudo((req.body ?? {}) as ClassificLaudoPayload)
    void runCollectJob()
      .then((collectResult) => {
        console.info(
          `[classific-laudos] Coleta pós-laudo OK importados=${collectResult.imported} laudos=${collectResult.laudos} rne=${collectResult.rne}`,
        )
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Falha na coleta pós-laudo'
        console.warn(`[classific-laudos] Coleta pós-laudo ignorada: ${message}`)
      })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao lançar laudo no Classific.',
    })
  }
})

export default router
