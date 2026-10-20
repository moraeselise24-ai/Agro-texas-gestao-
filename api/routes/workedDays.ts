import { Router, type Request, type Response } from 'express'
import { createClassifierPaymentEntry, deleteClassifierPaymentEntry, getWorkedDaysCompensation, saveClassifierDailyRate } from '../repositories/classifierCompensationRepo.js'
import { listWorkedDaysByClassifier } from '../repositories/osRepo.js'
import { buildWorkedDaysPdf, buildWorkedDaysXlsx } from '../services/workedDaysExport.js'
import { formatResponsavelNome, getRequestUser } from '../utils/requestUser.js'
import { syncWorkedDaysExpenses } from '../repositories/expensesRepo.js'

const router = Router()

const parseAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : 0
}

const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)

const isCompensationSchemaMissing = (error: unknown): boolean =>
  error instanceof Error && /classifier_daily_rates|classifier_payment_entries|source_key|source_type|schema cache/i.test(error.message)

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
    let compensation = new Map()
    try {
      compensation = await getWorkedDaysCompensation({ items: result.items, from, to })
    } catch (error) {
      if (!isCompensationSchemaMissing(error)) throw error
    }
    try {
      await syncWorkedDaysExpenses({ items: result.items, from, to })
    } catch (error) {
      if (!isCompensationSchemaMissing(error)) throw error
    }
    const items = result.items.map((item) => ({
      ...item,
      ...(compensation.get(item.classifierName.trim().replace(/\s+/g, ' ')) ?? {
        dailyRateBRL: null, projectedPaymentBRL: 0, paidAmountBRL: 0, advanceAmountBRL: 0,
        balanceBRL: 0, paymentStatus: 'a_configurar', payments: [],
      }),
    }))
    const totals = {
      ...result.totals,
      projectedPaymentBRL: items.reduce((sum, item) => sum + item.projectedPaymentBRL, 0),
      paidAmountBRL: items.reduce((sum, item) => sum + item.paidAmountBRL, 0),
      balanceBRL: items.reduce((sum, item) => sum + item.balanceBRL, 0),
    }
    res.status(200).json({ success: true, items, totals })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar dias trabalhados',
    })
  }
})

router.put('/rates/:classifierName', async (req: Request, res: Response): Promise<void> => {
  try {
    const classifierName = String(req.params.classifierName ?? '').trim()
    const dailyRateBRL = parseAmount((req.body as { dailyRateBRL?: unknown })?.dailyRateBRL)
    if (!classifierName || dailyRateBRL <= 0) {
      res.status(400).json({ success: false, error: 'Informe o colaborador e uma diária válida' })
      return
    }
    const dailyRate = await saveClassifierDailyRate({ classifierName, dailyRateBRL })
    res.status(200).json({ success: true, dailyRateBRL: dailyRate })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Falha ao salvar diária' })
  }
})

router.post('/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>
    const classifierName = String(body.classifierName ?? '').trim()
    const periodFrom = String(body.periodFrom ?? '').trim()
    const periodTo = String(body.periodTo ?? '').trim()
    const paidAt = String(body.paidAt ?? '').trim()
    const amountBRL = parseAmount(body.amountBRL)
    const type = body.type === 'adiantamento' ? 'adiantamento' : 'pagamento'
    const notes = String(body.notes ?? '').trim() || null
    if (!classifierName || !validDate(periodFrom) || !validDate(periodTo) || !validDate(paidAt) || amountBRL <= 0) {
      res.status(400).json({ success: false, error: 'Preencha os dados do lançamento corretamente' })
      return
    }
    const user = await getRequestUser(req)
    const payment = await createClassifierPaymentEntry({
      classifierName, periodFrom, periodTo, paidAt, amountBRL, type, notes,
      createdByUserId: user?.id ?? null, createdByName: formatResponsavelNome(user),
    })
    res.status(201).json({ success: true, payment })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Falha ao registrar pagamento' })
  }
})

router.delete('/payments/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) { res.status(400).json({ success: false, error: 'Lançamento não informado' }); return }
    await deleteClassifierPaymentEntry(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'Falha ao excluir lançamento' })
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
