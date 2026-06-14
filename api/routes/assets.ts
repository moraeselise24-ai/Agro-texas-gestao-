import { Router, type Request, type Response } from 'express'
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  createAssetOption,
  deactivateAssetOption,
  deleteAsset,
  disposeAsset,
  getAssetsSummary,
  listAssetOptions,
  listAssets,
  saveAsset,
  type AssetInput,
} from '../repositories/assetsRepo.js'
import type { AssetCondition, AssetStatus } from '../types.js'

const router = Router()

const parseAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').trim()
  if (!raw) return 0
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

const stringOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return text ? text : null
}

const dateOrNull = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

const parseStatus = (value: unknown): AssetStatus => {
  const text = String(value ?? 'ativo')
  return ASSET_STATUSES.has(text as AssetStatus) ? (text as AssetStatus) : 'ativo'
}

const parseCondition = (value: unknown): AssetCondition => {
  const text = String(value ?? 'bom')
  return ASSET_CONDITIONS.has(text as AssetCondition) ? (text as AssetCondition) : 'bom'
}

const buildPayload = (req: Request, id?: string): AssetInput | null => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const code = String(body.code ?? '').trim()
  const name = String(body.name ?? '').trim()
  const category = String(body.category ?? '').trim()
  if (!code || !name || !category) return null

  const usefulLifeRaw = Number(body.usefulLifeMonths ?? 0)
  return {
    id,
    code,
    name,
    category,
    brand: stringOrNull(body.brand),
    model: stringOrNull(body.model),
    serialNumber: stringOrNull(body.serialNumber),
    location: stringOrNull(body.location),
    responsibleName: stringOrNull(body.responsibleName),
    status: parseStatus(body.status),
    condition: parseCondition(body.condition),
    acquisitionDate: dateOrNull(body.acquisitionDate),
    acquisitionValueBRL: parseAmount(body.acquisitionValueBRL),
    usefulLifeMonths: Number.isFinite(usefulLifeRaw) && usefulLifeRaw > 0 ? Math.round(usefulLifeRaw) : null,
    warrantyUntil: dateOrNull(body.warrantyUntil),
    nextMaintenanceDate: dateOrNull(body.nextMaintenanceDate),
    disposalDate: dateOrNull(body.disposalDate),
    disposalReason: stringOrNull(body.disposalReason),
    notes: stringOrNull(body.notes),
  }
}

router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await getAssetsSummary()
    res.status(200).json({ success: true, summary })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao resumir patrimônio',
    })
  }
})

router.get('/facets', async (_req: Request, res: Response): Promise<void> => {
  try {
    const facets = await listAssetOptions()
    res.status(200).json({ success: true, ...facets })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar filtros',
    })
  }
})

router.post('/options/:type', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = String(req.params.type ?? '')
    if (!['category', 'brand', 'model'].includes(type)) {
      res.status(400).json({ success: false, error: 'Tipo inválido' })
      return
    }
    const name = String((req.body as { name?: unknown } | undefined)?.name ?? '').trim()
    if (!name) {
      res.status(400).json({ success: false, error: 'Nome obrigatório' })
      return
    }
    const option = await createAssetOption(type as 'category' | 'brand' | 'model', name)
    res.status(201).json({ success: true, option })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao cadastrar opção',
    })
  }
})

router.delete('/options/:type/:name', async (req: Request, res: Response): Promise<void> => {
  try {
    const type = String(req.params.type ?? '')
    if (!['category', 'brand', 'model'].includes(type)) {
      res.status(400).json({ success: false, error: 'Tipo inválido' })
      return
    }
    const name = decodeURIComponent(String(req.params.name ?? '')).trim()
    if (!name) {
      res.status(400).json({ success: false, error: 'Nome obrigatório' })
      return
    }
    await deactivateAssetOption(type as 'category' | 'brand' | 'model', name)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao remover opção',
    })
  }
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const statusRaw = String(req.query.status ?? '')
    const status = ASSET_STATUSES.has(statusRaw as AssetStatus) ? (statusRaw as AssetStatus) : undefined
    const result = await listAssets({
      q: req.query.q ? String(req.query.q) : undefined,
      category: req.query.category ? String(req.query.category) : undefined,
      location: req.query.location ? String(req.query.location) : undefined,
      status,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    })
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar patrimônio',
    })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = buildPayload(req)
    if (!payload) {
      res.status(400).json({ success: false, error: 'Código, nome e categoria são obrigatórios' })
      return
    }
    const asset = await saveAsset(payload)
    res.status(201).json({ success: true, asset })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao salvar patrimônio',
    })
  }
})

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    const payload = buildPayload(req, id)
    if (!id || !payload) {
      res.status(400).json({ success: false, error: 'Dados inválidos' })
      return
    }
    const asset = await saveAsset(payload)
    res.status(200).json({ success: true, asset })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao atualizar patrimônio',
    })
  }
})

router.post('/:id/dispose', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    const status = parseStatus((req.body as { status?: unknown } | undefined)?.status)
    if (!id) {
      res.status(400).json({ success: false, error: 'ID obrigatório' })
      return
    }
    const asset = await disposeAsset(id, status, stringOrNull((req.body as { reason?: unknown } | undefined)?.reason))
    res.status(200).json({ success: true, asset })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao baixar patrimônio',
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
    await deleteAsset(id)
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao excluir patrimônio',
    })
  }
})

export default router
