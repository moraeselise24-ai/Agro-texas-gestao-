import { Router, type Request, type Response } from 'express'
import {
  SERVICE_ORDER_STATUSES,
  deleteServiceOrderDraft,
  getServiceOrderDraftById,
  listServiceOrderFacets,
  listServiceOrderDrafts,
  queueServiceOrderDraft,
  saveServiceOrderDraft,
  type ServiceOrderDraftInput,
} from '../repositories/serviceOrdersRepo.js'
import type { ServiceOrderDraftStatus } from '../types.js'
import { formatResponsavelNome, getRequestUser } from '../utils/requestUser.js'
import { processServiceOrderQueue } from '../services/serviceOrderBot.js'

const router = Router()

const stringOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return text ? text : null
}

const dateOrToday = (value: unknown): string => {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10)
}

const parseKg = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

const parseStatus = (value: unknown): ServiceOrderDraftStatus | undefined => {
  const text = String(value ?? '').trim()
  return SERVICE_ORDER_STATUSES.has(text as ServiceOrderDraftStatus)
    ? (text as ServiceOrderDraftStatus)
    : undefined
}

const booleanFromBody = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  return text === '1' || text === 'true' || text === 'sim'
}

const buildPayload = async (req: Request, id?: string): Promise<ServiceOrderDraftInput | null> => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const clientName = String(body.clientName ?? '').trim()
  const embarkPoint = String(body.embarkPoint ?? '').trim()
  const destination = String(body.destination ?? '').trim()
  const product = String(body.product ?? '').trim()
  const lotKg = parseKg(body.lotKg)
  if (!clientName || !embarkPoint || !destination || !product || lotKg <= 0) return null

  const user = await getRequestUser(req)
  return {
    id,
    requestedDate: dateOrToday(body.requestedDate),
    clientName,
    embarkPoint,
    embarkPointMunicipio: stringOrNull(body.embarkPointMunicipio),
    embarkPointUf: stringOrNull(body.embarkPointUf),
    embarkPointNeedsCreate: booleanFromBody(body.embarkPointNeedsCreate),
    destination,
    destinationMunicipio: stringOrNull(body.destinationMunicipio),
    destinationUf: stringOrNull(body.destinationUf),
    destinationNeedsCreate: booleanFromBody(body.destinationNeedsCreate),
    product,
    contractNumber: stringOrNull(body.contractNumber),
    lotKg,
    classifierName: stringOrNull(body.classifierName),
    producerName: stringOrNull(body.producerName),
    notes: stringOrNull(body.notes),
    status: parseStatus(body.status),
    createdByUserId: user?.id ?? null,
    createdByName: formatResponsavelNome(user),
  }
}

router.get('/facets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const facets = await listServiceOrderFacets()
    res.status(200).json({ success: true, facets })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar cadastros de O.S.',
    })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await listServiceOrderDrafts({
      q: req.query.q ? String(req.query.q) : undefined,
      status: parseStatus(req.query.status),
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar O.S.',
    })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    const order = id ? await getServiceOrderDraftById(id) : null
    if (!order) {
      res.status(404).json({ success: false, error: 'O.S. não encontrada' })
      return
    }
    res.status(200).json({ success: true, order })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao buscar O.S.',
    })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = await buildPayload(req)
    if (!payload) {
      res.status(400).json({
        success: false,
        error: 'Cliente, embarque, destino, produto e lote são obrigatórios',
      })
      return
    }
    const order = await saveServiceOrderDraft(payload)
    res.status(201).json({ success: true, order })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao salvar O.S.',
    })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    const payload = await buildPayload(req, id)
    if (!id || !payload) {
      res.status(400).json({ success: false, error: 'Dados inválidos' })
      return
    }
    const order = await saveServiceOrderDraft(payload)
    res.status(200).json({ success: true, order })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao atualizar O.S.',
    })
  }
})

router.post('/:id/queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'ID obrigatório' })
      return
    }
    const order = await queueServiceOrderDraft(id)
    res.status(200).json({ success: true, order })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao colocar O.S. na fila',
    })
  }
})

router.post('/process-queue', async (req: Request, res: Response): Promise<void> => {
  try {
    const limitRaw = Number((req.body as { limit?: unknown } | undefined)?.limit ?? 3)
    const result = await processServiceOrderQueue(Number.isFinite(limitRaw) ? limitRaw : 3)
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao processar fila de O.S.',
    })
  }
})

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'ID obrigatório' })
      return
    }
    await deleteServiceOrderDraft(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao excluir O.S.',
    })
  }
})

export default router
