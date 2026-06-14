import { Router, type Request, type Response } from 'express'
import { listWorkedDaysByClassifier } from '../repositories/osRepo.js'
import { buildWorkedDaysPdf, buildWorkedDaysXlsx } from '../services/workedDaysExport.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = String(req.query.from ?? '').trim()
    const to = String(req.query.to ?? '').trim()
    const q = req.query.q ? String(req.query.q) : undefined

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'Missing from/to' })
      return
    }

    const result = await listWorkedDaysByClassifier({ from, to, q })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar dias trabalhados',
    })
  }
})

router.get('/export/xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = String(req.query.from ?? '').trim()
    const to = String(req.query.to ?? '').trim()
    const q = req.query.q ? String(req.query.q) : undefined

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'Missing from/to' })
      return
    }

    const result = await listWorkedDaysByClassifier({ from, to, q })
    const buf = await buildWorkedDaysXlsx(result)
    res.setHeader('Content-Disposition', 'attachment; filename="dias-trabalhados.xlsx"')
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar Excel',
    })
  }
})

router.get('/export/pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const from = String(req.query.from ?? '').trim()
    const to = String(req.query.to ?? '').trim()
    const q = req.query.q ? String(req.query.q) : undefined

    if (!from || !to) {
      res.status(400).json({ success: false, error: 'Missing from/to' })
      return
    }

    const result = await listWorkedDaysByClassifier({ from, to, q })
    const buf = await buildWorkedDaysPdf({ ...result, from, to })
    res.setHeader('Content-Disposition', 'attachment; filename="dias-trabalhados.pdf"')
    res.setHeader('Content-Type', 'application/pdf')
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar PDF',
    })
  }
})

export default router
