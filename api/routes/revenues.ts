import { Router, type Request, type Response } from 'express'
import {
  createRevenueCategory,
  deactivateRevenueCategory,
  deleteRevenue,
  isRevenueRecurrenceFrequency,
  isRevenueStatus,
  listRevenueCategories,
  listRevenuesForExport,
  listRevenues,
  saveRevenue,
} from '../repositories/revenuesRepo.js'
import { buildRevenuesPdf, buildRevenuesXlsx } from '../services/revenuesExport.js'
import { formatResponsavelNome, getRequestUser } from '../utils/requestUser.js'

const router = Router()

const parseAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

const stringOrNull = (value: unknown): string | null => {
  const v = String(value ?? '').trim()
  return v ? v : null
}

const parseListFilters = (req: Request) => {
  const statusRaw = String(req.query.status ?? '')
  const status = isRevenueStatus(statusRaw) ? statusRaw : undefined
  return {
    from: req.query.from ? String(req.query.from) : undefined,
    to: req.query.to ? String(req.query.to) : undefined,
    q: req.query.q ? String(req.query.q) : undefined,
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    category: req.query.category ? String(req.query.category) : undefined,
    dateBasis: ['date', 'due', 'expected', 'received'].includes(String(req.query.dateBasis ?? ''))
      ? (String(req.query.dateBasis) as 'date' | 'due' | 'expected' | 'received')
      : undefined,
    status,
  }
}

router.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await listRevenueCategories()
    res.status(200).json({ success: true, categories })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar categorias',
    })
  }
})

router.post('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const name = String((req.body as { name?: unknown })?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ success: false, error: 'Nome da categoria é obrigatório' })
      return
    }
    const category = await createRevenueCategory(name)
    res.status(201).json({ success: true, category })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao criar categoria',
    })
  }
})

router.delete('/categories/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    await deactivateRevenueCategory(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao remover categoria',
    })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listRevenues(parseListFilters(req))
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar receitas',
    })
  }
})

router.get('/export/xlsx', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listRevenuesForExport(parseListFilters(req))
    const buf = await buildRevenuesXlsx(result)
    res.setHeader('Content-Disposition', 'attachment; filename="receitas.xlsx"')
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
    const filters = parseListFilters(req)
    const result = await listRevenuesForExport(filters)
    const buf = await buildRevenuesPdf({ ...result, from: filters.from, to: filters.to })
    res.setHeader('Content-Disposition', 'attachment; filename="receitas.pdf"')
    res.setHeader('Content-Type', 'application/pdf')
    res.status(200).send(buf)
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao exportar PDF',
    })
  }
})

const buildSavePayload = async (
  req: Request,
  id?: string,
): Promise<Parameters<typeof saveRevenue>[0] | null> => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const date = String(body.date ?? '').trim()
  const category = String(body.category ?? '').trim()
  const description = String(body.description ?? '').trim()
  const amountBRL = parseAmount(body.amountBRL)
  const statusRaw = String(body.status ?? 'a_receber')
  const status = isRevenueStatus(statusRaw) ? statusRaw : 'a_receber'
  const recurrenceRaw = String(body.recurrenceFrequency ?? 'mensal')
  const recurrenceFrequency = isRevenueRecurrenceFrequency(recurrenceRaw) ? recurrenceRaw : 'mensal'

  if (!date || !category || !description || amountBRL <= 0) return null

  const user = await getRequestUser(req)
  return {
    id,
    date,
    category,
    clientName: stringOrNull(body.clientName),
    description,
    amountBRL,
    paymentMethod: stringOrNull(body.paymentMethod),
    documentNumber: stringOrNull(body.documentNumber),
    dueDate: stringOrNull(body.dueDate),
    expectedReceiptDate: stringOrNull(body.expectedReceiptDate),
    receivedAt: stringOrNull(body.receivedAt),
    status,
    isRecurring: Boolean(body.isRecurring),
    recurrenceFrequency,
    recurrenceUntil: stringOrNull(body.recurrenceUntil),
    notes: stringOrNull(body.notes),
    responsavel: {
      userId: user?.id ?? null,
      nome: formatResponsavelNome(user),
    },
  }
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await buildSavePayload(req)
    if (!payload) {
      res.status(400).json({ success: false, error: 'Dados inválidos' })
      return
    }
    const revenue = await saveRevenue(payload)
    res.status(201).json({ success: true, revenue })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao salvar receita',
    })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    const payload = await buildSavePayload(req, id)
    if (!payload) {
      res.status(400).json({ success: false, error: 'Dados inválidos' })
      return
    }
    const revenue = await saveRevenue(payload)
    res.status(200).json({ success: true, revenue })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao atualizar receita',
    })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'Missing id' })
      return
    }
    await deleteRevenue(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao excluir receita',
    })
  }
})

export default router
