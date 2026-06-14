import { Router, type Request, type Response } from 'express'
import { listPlateOccurrences } from '../repositories/osRepo.js'
import { buildClassificLaudoPdf } from '../services/classificLaudoPdf.js'
import { buildPlateOccurrencesPdf, buildPlateOccurrencesXlsx } from '../services/plateOccurrencesExport.js'

const router = Router()

const parseQuery = (req: Request) => {
  const from = String(req.query.from ?? '')
  const to = String(req.query.to ?? '')
  const plate = req.query.plate ? String(req.query.plate) : undefined
  const q = req.query.q ? String(req.query.q) : undefined
  const page = Number(req.query.page ?? 1)
  const pageSize = Number(req.query.pageSize ?? 25)

  return {
    from,
    to,
    plate,
    q,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : 25,
  }
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const args = parseQuery(req)
    if (!args.from || !args.to) {
      res.status(400).json({ success: false, error: 'Missing from/to' })
      return
    }

    const result = await listPlateOccurrences(args)
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar ocorrências de placas',
    })
  }
})

router.get('/laudos/:laudoId/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const laudoId = String(req.params.laudoId ?? '').trim()
    if (!laudoId) {
      res.status(400).json({ success: false, error: 'Laudo não informado' })
      return
    }

    const buf = await buildClassificLaudoPdf({
      laudoId,
      plate: req.query.plate ? String(req.query.plate) : undefined,
      osId: req.query.osId ? String(req.query.osId) : undefined,
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="laudo-${laudoId}.pdf"`)
    res.send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao gerar PDF do laudo',
    })
  }
})

router.get('/export/xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const args = parseQuery(req)
    const result = await listPlateOccurrences({ ...args, page: 1, pageSize: 10000 })
    const buf = await buildPlateOccurrencesXlsx({ items: result.items, summary: result.summary })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="ocorrencias-placas_${args.from}_${args.to}.xlsx"`)
    res.send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar Excel',
    })
  }
})

router.get('/export/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const args = parseQuery(req)
    const result = await listPlateOccurrences({ ...args, page: 1, pageSize: 10000 })
    const buf = await buildPlateOccurrencesPdf({
      items: result.items,
      summary: result.summary,
      from: args.from,
      to: args.to,
      extractedAt: new Date(),
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="ocorrencias-placas_${args.from}_${args.to}.pdf"`)
    res.send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar PDF',
    })
  }
})

export default router
