import crypto from 'crypto'
import type { Asset, AssetCondition, AssetStatus } from '../types.js'
import { getSupabase } from '../supabase.js'

type AssetRow = {
  id: string
  code: string
  name: string
  category: string
  brand: string | null
  model: string | null
  serial_number: string | null
  location: string | null
  responsible_name: string | null
  status: AssetStatus | null
  condition: AssetCondition | null
  acquisition_date: string | null
  acquisition_value_brl: number | null
  useful_life_months: number | null
  warranty_until: string | null
  next_maintenance_date: string | null
  disposal_date: string | null
  disposal_reason: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

type AssetOptionType = 'category' | 'brand' | 'model'

type AssetOptionRow = {
  id: string
  type: AssetOptionType
  name: string
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

export type AssetInput = {
  id?: string
  code: string
  name: string
  category: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  location: string | null
  responsibleName: string | null
  status: AssetStatus
  condition: AssetCondition
  acquisitionDate: string | null
  acquisitionValueBRL: number
  usefulLifeMonths: number | null
  warrantyUntil: string | null
  nextMaintenanceDate: string | null
  disposalDate: string | null
  disposalReason: string | null
  notes: string | null
}

export const ASSET_STATUSES = new Set<AssetStatus>([
  'ativo',
  'manutencao',
  'emprestado',
  'baixado',
  'vendido',
  'perdido',
])

export const ASSET_CONDITIONS = new Set<AssetCondition>(['novo', 'bom', 'regular', 'critico'])

const COLUMNS =
  'id,code,name,category,brand,model,serial_number,location,responsible_name,status,condition,acquisition_date,acquisition_value_brl,useful_life_months,warranty_until,next_maintenance_date,disposal_date,disposal_reason,notes,created_at,updated_at'

const OPTION_COLUMNS = 'id,type,name,active,created_at,updated_at'

const makeId = (): string => crypto.randomUUID()

const slugOptionId = (type: AssetOptionType, name: string): string =>
  `${type}-${name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 54)}`

const normalizeOptionName = (name: string): string => name.trim().replace(/\s+/g, ' ')

const upsertAssetOption = async (type: AssetOptionType, rawName: string | null): Promise<void> => {
  const name = normalizeOptionName(rawName ?? '')
  if (!name) return
  const now = new Date().toISOString()
  const { error } = await getSupabase()
    .from('operation_asset_options')
    .upsert(
      {
        id: slugOptionId(type, name),
        type,
        name,
        active: true,
        updated_at: now,
      },
      { onConflict: 'id' },
    )
  if (error) throw new Error(error.message)
}

const monthsBetween = (from: string, to: Date): number => {
  const start = new Date(`${from}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 0
  return Math.max(0, (to.getFullYear() - start.getFullYear()) * 12 + to.getMonth() - start.getMonth())
}

const currentValue = (row: AssetRow): number => {
  const acquisitionValue = Number(row.acquisition_value_brl ?? 0)
  if (!Number.isFinite(acquisitionValue) || acquisitionValue <= 0) return 0
  if (row.status === 'baixado' || row.status === 'vendido' || row.status === 'perdido') return 0
  if (!row.acquisition_date || !row.useful_life_months || row.useful_life_months <= 0) return acquisitionValue
  const elapsed = monthsBetween(row.acquisition_date, new Date())
  const remainingRate = Math.max(0, 1 - elapsed / row.useful_life_months)
  return Math.round(acquisitionValue * remainingRate * 100) / 100
}

const fromRow = (row: AssetRow): Asset => ({
  id: row.id,
  code: row.code,
  name: row.name,
  category: row.category,
  brand: row.brand ?? null,
  model: row.model ?? null,
  serialNumber: row.serial_number ?? null,
  location: row.location ?? null,
  responsibleName: row.responsible_name ?? null,
  status: row.status ?? 'ativo',
  condition: row.condition ?? 'bom',
  acquisitionDate: row.acquisition_date ?? null,
  acquisitionValueBRL: Number(row.acquisition_value_brl ?? 0),
  usefulLifeMonths: row.useful_life_months ?? null,
  currentValueBRL: currentValue(row),
  warrantyUntil: row.warranty_until ?? null,
  nextMaintenanceDate: row.next_maintenance_date ?? null,
  disposalDate: row.disposal_date ?? null,
  disposalReason: row.disposal_reason ?? null,
  notes: row.notes ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

export const listAssets = async (args: {
  q?: string
  category?: string
  status?: AssetStatus
  location?: string
  page?: number
  pageSize?: number
}): Promise<{ items: Asset[]; total: number }> => {
  const sb = getSupabase()
  const page = args.page && args.page > 0 ? args.page : 1
  const pageSize = args.pageSize && args.pageSize > 0 ? Math.min(args.pageSize, 500) : 50
  const offset = (page - 1) * pageSize
  const toIndex = offset + pageSize - 1

  let query = sb.from('operation_assets').select(COLUMNS, { count: 'exact' })

  if (args.status) query = query.eq('status', args.status)
  if (args.category) query = query.eq('category', args.category)
  if (args.location) query = query.eq('location', args.location)
  if (args.q) {
    const like = `%${args.q}%`
    query = query.or(
      `code.ilike.${like},name.ilike.${like},category.ilike.${like},brand.ilike.${like},model.ilike.${like},serial_number.ilike.${like},location.ilike.${like},responsible_name.ilike.${like}`,
    )
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, toIndex)

  if (error) throw new Error(error.message)
  return { items: (data ?? []).map((row) => fromRow(row as AssetRow)), total: count ?? 0 }
}

export const getAssetsSummary = async (): Promise<{
  total: number
  active: number
  maintenance: number
  critical: number
  acquisitionValueBRL: number
  currentValueBRL: number
  upcomingMaintenance: number
  warrantyExpiring: number
}> => {
  const sb = getSupabase()
  const { data, error } = await sb.from('operation_assets').select(COLUMNS).range(0, 9999)
  if (error) throw new Error(error.message)
  const assets = (data ?? []).map((row) => fromRow(row as AssetRow))
  const today = new Date()
  const limit = new Date(today)
  limit.setDate(limit.getDate() + 30)
  const inNext30 = (date: string | null) => {
    if (!date) return false
    const d = new Date(`${date}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d >= today && d <= limit
  }

  return {
    total: assets.length,
    active: assets.filter((asset) => asset.status === 'ativo' || asset.status === 'emprestado').length,
    maintenance: assets.filter((asset) => asset.status === 'manutencao').length,
    critical: assets.filter((asset) => asset.condition === 'critico').length,
    acquisitionValueBRL: assets.reduce((acc, asset) => acc + asset.acquisitionValueBRL, 0),
    currentValueBRL: assets.reduce((acc, asset) => acc + asset.currentValueBRL, 0),
    upcomingMaintenance: assets.filter((asset) => inNext30(asset.nextMaintenanceDate)).length,
    warrantyExpiring: assets.filter((asset) => inNext30(asset.warrantyUntil)).length,
  }
}

export const listAssetOptions = async (): Promise<{ categories: string[]; brands: string[]; models: string[]; locations: string[] }> => {
  const sb = getSupabase()
  const [{ data: optionRows, error: optionsError }, { data: assetRows, error: assetsError }] = await Promise.all([
    sb
      .from('operation_asset_options')
      .select(OPTION_COLUMNS)
      .eq('active', true)
      .order('name', { ascending: true }),
    sb.from('operation_assets').select('category,brand,model,location').range(0, 9999),
  ])
  if (optionsError) throw new Error(optionsError.message)
  if (assetsError) throw new Error(assetsError.message)
  const categories = new Set<string>()
  const brands = new Set<string>()
  const models = new Set<string>()
  const locations = new Set<string>()
  for (const row of (optionRows ?? []) as AssetOptionRow[]) {
    if (!row.name) continue
    if (row.type === 'category') categories.add(row.name)
    if (row.type === 'brand') brands.add(row.name)
    if (row.type === 'model') models.add(row.name)
  }
  for (const row of assetRows ?? []) {
    const category = String((row as { category?: unknown }).category ?? '').trim()
    const brand = String((row as { brand?: unknown }).brand ?? '').trim()
    const model = String((row as { model?: unknown }).model ?? '').trim()
    const location = String((row as { location?: unknown }).location ?? '').trim()
    if (category) categories.add(category)
    if (brand) brands.add(brand)
    if (model) models.add(model)
    if (location) locations.add(location)
  }
  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    models: [...models].sort((a, b) => a.localeCompare(b)),
    locations: [...locations].sort((a, b) => a.localeCompare(b)),
  }
}

export const createAssetOption = async (type: AssetOptionType, rawName: string): Promise<AssetOptionRow> => {
  const name = normalizeOptionName(rawName)
  if (!name) throw new Error('Nome obrigatório')
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('operation_asset_options')
    .upsert(
      {
        id: slugOptionId(type, name),
        type,
        name,
        active: true,
        updated_at: now,
      },
      { onConflict: 'id' },
    )
    .select(OPTION_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return data as AssetOptionRow
}

export const deactivateAssetOption = async (type: AssetOptionType, rawName: string): Promise<void> => {
  const name = normalizeOptionName(rawName)
  if (!name) throw new Error('Nome obrigatório')
  const { error } = await getSupabase()
    .from('operation_asset_options')
    .update({
      active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', slugOptionId(type, name))
  if (error) throw new Error(error.message)
}

export const saveAsset = async (input: AssetInput): Promise<Asset> => {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const id = input.id ?? makeId()
  const payload = {
    id,
    code: input.code,
    name: input.name,
    category: input.category,
    brand: input.brand,
    model: input.model,
    serial_number: input.serialNumber,
    location: input.location,
    responsible_name: input.responsibleName,
    status: input.status,
    condition: input.condition,
    acquisition_date: input.acquisitionDate,
    acquisition_value_brl: input.acquisitionValueBRL,
    useful_life_months: input.usefulLifeMonths,
    warranty_until: input.warrantyUntil,
    next_maintenance_date: input.nextMaintenanceDate,
    disposal_date: input.disposalDate,
    disposal_reason: input.disposalReason,
    notes: input.notes,
    updated_at: now,
  }

  const { data, error } = await sb
    .from('operation_assets')
    .upsert(payload, { onConflict: 'id' })
    .select(COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  await Promise.all([
    upsertAssetOption('category', input.category),
    upsertAssetOption('brand', input.brand),
    upsertAssetOption('model', input.model),
  ])
  return fromRow(data as AssetRow)
}

export const disposeAsset = async (id: string, status: AssetStatus, reason: string | null): Promise<Asset> => {
  if (!['baixado', 'vendido', 'perdido'].includes(status)) throw new Error('Status de baixa inválido')
  const sb = getSupabase()
  const { data, error } = await sb
    .from('operation_assets')
    .update({
      status,
      disposal_reason: reason,
      disposal_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromRow(data as AssetRow)
}

export const deleteAsset = async (id: string): Promise<void> => {
  const { error } = await getSupabase().from('operation_assets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
