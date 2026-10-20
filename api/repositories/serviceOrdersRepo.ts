import crypto from 'crypto'
import type { ServiceOrderDraft, ServiceOrderDraftStatus } from '../types.js'
import { getSupabase } from '../supabase.js'

type ServiceOrderDraftRow = {
  id: string
  reference_code: string
  requested_date: string
  client_name: string
  embark_point: string
  embark_point_municipio: string | null
  embark_point_uf: string | null
  embark_point_needs_create: boolean | null
  destination: string
  destination_municipio: string | null
  destination_uf: string | null
  destination_needs_create: boolean | null
  product: string
  contract_number: string | null
  lot_kg: number
  classifier_name: string | null
  producer_name: string | null
  notes: string | null
  status: ServiceOrderDraftStatus | null
  classific_os_id: string | null
  bot_error: string | null
  sent_at: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string | null
  updated_at: string | null
}

export type ServiceOrderDraftInput = {
  id?: string
  requestedDate: string
  clientName: string
  embarkPoint: string
  embarkPointMunicipio: string | null
  embarkPointUf: string | null
  embarkPointNeedsCreate: boolean
  destination: string
  destinationMunicipio: string | null
  destinationUf: string | null
  destinationNeedsCreate: boolean
  product: string
  contractNumber: string | null
  lotKg: number
  classifierName: string | null
  producerName: string | null
  notes: string | null
  status?: ServiceOrderDraftStatus
  createdByUserId?: string | null
  createdByName?: string | null
}

export const SERVICE_ORDER_STATUSES = new Set<ServiceOrderDraftStatus>([
  'rascunho',
  'pendente_envio',
  'enviando',
  'criada',
  'erro',
  'cancelada',
])

const COLUMNS =
  'id,reference_code,requested_date,client_name,embark_point,embark_point_municipio,embark_point_uf,embark_point_needs_create,destination,destination_municipio,destination_uf,destination_needs_create,product,contract_number,lot_kg,classifier_name,producer_name,notes,status,classific_os_id,bot_error,sent_at,created_by_user_id,created_by_name,created_at,updated_at'

export type ServiceOrderOptionType = 'client' | 'embark' | 'destination' | 'product'

type ServiceOrderOptionRow = {
  id: string
  type: ServiceOrderOptionType
  name: string
  municipio: string | null
  uf: string | null
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

export type ServiceOrderOptionInput = {
  type: ServiceOrderOptionType
  name: string | null | undefined
  municipio?: string | null
  uf?: string | null
}

export type ServiceOrderPlaceOption = {
  name: string
  municipio: string | null
  uf: string | null
}

export type ServiceOrderFacets = {
  clients: string[]
  products: string[]
  embarks: ServiceOrderPlaceOption[]
  destinations: ServiceOrderPlaceOption[]
}

const makeId = (): string => crypto.randomUUID()

const makeReferenceCode = (date: string): string =>
  `OSREQ-${date.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`

const fromRow = (row: ServiceOrderDraftRow): ServiceOrderDraft => ({
  id: row.id,
  referenceCode: row.reference_code,
  requestedDate: row.requested_date,
  clientName: row.client_name,
  embarkPoint: row.embark_point,
  embarkPointMunicipio: row.embark_point_municipio ?? null,
  embarkPointUf: row.embark_point_uf ?? null,
  embarkPointNeedsCreate: row.embark_point_needs_create ?? false,
  destination: row.destination,
  destinationMunicipio: row.destination_municipio ?? null,
  destinationUf: row.destination_uf ?? null,
  destinationNeedsCreate: row.destination_needs_create ?? false,
  product: row.product,
  contractNumber: row.contract_number ?? null,
  lotKg: Number(row.lot_kg ?? 0),
  classifierName: row.classifier_name ?? null,
  producerName: row.producer_name ?? null,
  notes: row.notes ?? null,
  status: row.status ?? 'rascunho',
  classificOsId: row.classific_os_id ?? null,
  botError: row.bot_error ?? null,
  sentAt: row.sent_at ?? null,
  createdByUserId: row.created_by_user_id ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

const slug = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

const normalizeName = (value: string | null | undefined): string => String(value ?? '').trim()

const optionId = (type: ServiceOrderOptionType, name: string): string => `${type}-${slug(name)}`

const sortStrings = (items: Iterable<string>): string[] =>
  [...items].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'))

const isLikelyPlate = (value: string): boolean => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i.test(value.replace(/[^a-z0-9]/gi, ''))

const isLikelyMoney = (value: string): boolean => /^R\$\s*[\d.,]+$/i.test(value.trim())

const isLikelyClientName = (value: string | null | undefined): boolean => {
  const clean = normalizeName(value)
  if (!clean) return false
  if (clean.length < 3) return false
  if (isLikelyPlate(clean) || isLikelyMoney(clean)) return false
  if (/^\d+([.,]\d+)?$/.test(clean)) return false
  if (/^teste\s+gr[aá]tis/i.test(clean)) return false
  if (/^(detalhar|alterar|excluir|visualizar|selecionar)$/i.test(clean)) return false
  return /[a-zÀ-ÿ]{3,}/i.test(clean)
}

const sortClients = (items: Iterable<string>): string[] => {
  const byBase = new Map<string, string>()
  for (const item of items) {
    const clean = normalizeName(item)
    if (!isLikelyClientName(clean)) continue
    const base = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/,\s*[^,]+?\s+-\s*[A-Z]{2}$/i, '')
      .replace(/\b(LTDA|S\/?A|SA|EIRELI|ME|EPP)\.?$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('pt-BR')
    const current = byBase.get(base)
    if (!current || clean.length > current.length) byBase.set(base, clean)
  }
  return sortStrings(byBase.values())
}

const sortPlaces = (items: Iterable<ServiceOrderPlaceOption>): ServiceOrderPlaceOption[] =>
  [...items].filter((item) => item.name).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))

const addPlace = (
  map: Map<string, ServiceOrderPlaceOption>,
  name: string | null | undefined,
  municipio?: string | null,
  uf?: string | null,
) => {
  const cleanName = normalizeName(name)
  if (!cleanName) return
  const key = cleanName.toLocaleLowerCase('pt-BR')
  const current = map.get(key)
  const nextMunicipio = current?.municipio ?? (normalizeName(municipio) || null)
  const nextUf = current?.uf ?? (normalizeName(uf) || null)
  map.set(key, {
    name: current?.name ?? cleanName,
    municipio: nextMunicipio,
    uf: nextUf,
  })
}

const upsertOption = async (
  type: ServiceOrderOptionType,
  name: string | null | undefined,
  municipio?: string | null,
  uf?: string | null,
): Promise<void> => {
  const cleanName = normalizeName(name)
  if (!cleanName) return
  if (type === 'client' && !isLikelyClientName(cleanName)) return
  const now = new Date().toISOString()
  const payload = {
    id: optionId(type, cleanName),
    type,
    name: cleanName,
    municipio: normalizeName(municipio) || null,
    uf: normalizeName(uf) || null,
    active: true,
    updated_at: now,
  }
  const { error } = await getSupabase()
    .from('operation_service_order_options')
    .upsert(payload, { onConflict: 'id' })
  if (error && !/operation_service_order_options/i.test(error.message)) {
    throw new Error(error.message)
  }
}

export const upsertServiceOrderOptions = async (items: ServiceOrderOptionInput[]): Promise<number> => {
  const now = new Date().toISOString()
  const rows = items
    .map((item) => {
      const cleanName = normalizeName(item.name)
      if (!cleanName) return null
      if (item.type === 'client' && !isLikelyClientName(cleanName)) return null
      return {
        id: optionId(item.type, cleanName),
        type: item.type,
        name: cleanName,
        municipio: normalizeName(item.municipio) || null,
        uf: normalizeName(item.uf) || null,
        active: true,
        updated_at: now,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row != null)

  const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()]
  if (!uniqueRows.length) return 0

  const { error } = await getSupabase()
    .from('operation_service_order_options')
    .upsert(uniqueRows, { onConflict: 'id' })

  if (error && !/operation_service_order_options/i.test(error.message)) {
    throw new Error(error.message)
  }

  return uniqueRows.length
}

export const replaceServiceOrderOptionsByType = async (
  type: ServiceOrderOptionType,
  items: ServiceOrderOptionInput[],
): Promise<number> => {
  const sb = getSupabase()
  const { error: deactivateError } = await sb
    .from('operation_service_order_options')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('type', type)

  if (deactivateError && !/operation_service_order_options/i.test(deactivateError.message)) {
    throw new Error(deactivateError.message)
  }

  return upsertServiceOrderOptions(items.filter((item) => item.type === type))
}

const rememberDraftOptions = async (input: ServiceOrderDraftInput): Promise<void> => {
  await Promise.all([
    upsertOption('client', input.clientName),
    upsertOption('product', input.product),
    upsertOption('embark', input.embarkPoint, input.embarkPointMunicipio, input.embarkPointUf),
    upsertOption('destination', input.destination, input.destinationMunicipio, input.destinationUf),
  ])
}

export const listServiceOrderFacets = async (): Promise<ServiceOrderFacets> => {
  const sb = getSupabase()
  const clients = new Set<string>()
  const products = new Set<string>(['Soja', 'Milho', 'Sorgo', 'Caroço de Algodão'])
  const embarks = new Map<string, ServiceOrderPlaceOption>()
  const destinations = new Map<string, ServiceOrderPlaceOption>()

  const [optionsResult, osResult, draftsResult] = await Promise.all([
    sb
      .from('operation_service_order_options')
      .select('id,type,name,municipio,uf,active,created_at,updated_at')
      .eq('active', true),
    sb
      .from('os_records')
      .select('client_name,embark_point')
      .not('client_name', 'is', null)
      .range(0, 9999),
    sb
      .from('operation_service_order_drafts')
      .select('client_name,embark_point,embark_point_municipio,embark_point_uf,destination,destination_municipio,destination_uf,product')
      .range(0, 9999),
  ])

  if (optionsResult.error && !/operation_service_order_options/i.test(optionsResult.error.message)) {
    throw new Error(optionsResult.error.message)
  }
  if (osResult.error && !/os_records/i.test(osResult.error.message)) throw new Error(osResult.error.message)
  if (draftsResult.error && !/operation_service_order_drafts/i.test(draftsResult.error.message)) {
    throw new Error(draftsResult.error.message)
  }

  ;((optionsResult.data ?? []) as ServiceOrderOptionRow[]).forEach((row) => {
    if (row.type === 'client' && isLikelyClientName(row.name)) clients.add(normalizeName(row.name))
    if (row.type === 'product') products.add(normalizeName(row.name))
    if (row.type === 'embark') addPlace(embarks, row.name, row.municipio, row.uf)
    if (row.type === 'destination') addPlace(destinations, row.name, row.municipio, row.uf)
  })

  ;((osResult.data ?? []) as Array<{ client_name: string | null; embark_point: string | null }>).forEach(
    (row) => {
      if (isLikelyClientName(row.client_name)) clients.add(normalizeName(row.client_name))
      addPlace(embarks, row.embark_point)
    },
  )

  ;(
    (draftsResult.data ?? []) as Array<{
      client_name: string | null
      embark_point: string | null
      embark_point_municipio: string | null
      embark_point_uf: string | null
      destination: string | null
      destination_municipio: string | null
      destination_uf: string | null
      product: string | null
    }>
  ).forEach((row) => {
    if (isLikelyClientName(row.client_name)) clients.add(normalizeName(row.client_name))
    const product = normalizeName(row.product)
    if (product) products.add(product)
    addPlace(embarks, row.embark_point, row.embark_point_municipio, row.embark_point_uf)
    addPlace(destinations, row.destination, row.destination_municipio, row.destination_uf)
  })

  return {
    clients: sortClients(clients),
    products: sortStrings(products),
    embarks: sortPlaces(embarks.values()),
    destinations: sortPlaces(destinations.values()),
  }
}

export const listServiceOrderDrafts = async (args: {
  q?: string
  status?: ServiceOrderDraftStatus
  from?: string
  to?: string
  page?: number
  pageSize?: number
}): Promise<{ items: ServiceOrderDraft[]; total: number }> => {
  const sb = getSupabase()
  const page = args.page && args.page > 0 ? args.page : 1
  const pageSize = args.pageSize && args.pageSize > 0 ? Math.min(args.pageSize, 500) : 25
  const offset = (page - 1) * pageSize
  const toIndex = offset + pageSize - 1

  let query = sb.from('operation_service_order_drafts').select(COLUMNS, { count: 'exact' })
  if (args.status) query = query.eq('status', args.status)
  if (args.from) query = query.gte('requested_date', args.from)
  if (args.to) query = query.lte('requested_date', args.to)
  if (args.q) {
    const like = `%${args.q}%`
    query = query.or(
      `reference_code.ilike.${like},client_name.ilike.${like},embark_point.ilike.${like},destination.ilike.${like},product.ilike.${like},classifier_name.ilike.${like},producer_name.ilike.${like},classific_os_id.ilike.${like}`,
    )
  }

  const { data, count, error } = await query
    .order('requested_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, toIndex)

  if (error) throw new Error(error.message)
  return { items: (data ?? []).map((row) => fromRow(row as ServiceOrderDraftRow)), total: count ?? 0 }
}

export const getServiceOrderDraftById = async (id: string): Promise<ServiceOrderDraft | null> => {
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? fromRow(data as ServiceOrderDraftRow) : null
}

export const saveServiceOrderDraft = async (
  input: ServiceOrderDraftInput,
): Promise<ServiceOrderDraft> => {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const existing = input.id ? await getServiceOrderDraftById(input.id) : null
  const id = input.id ?? makeId()
  const status = input.status ?? existing?.status ?? 'rascunho'
  const payload = {
    id,
    reference_code: existing?.referenceCode ?? makeReferenceCode(input.requestedDate),
    requested_date: input.requestedDate,
    client_name: input.clientName,
    embark_point: input.embarkPoint,
    embark_point_municipio: input.embarkPointMunicipio,
    embark_point_uf: input.embarkPointUf,
    embark_point_needs_create: input.embarkPointNeedsCreate,
    destination: input.destination,
    destination_municipio: input.destinationMunicipio,
    destination_uf: input.destinationUf,
    destination_needs_create: input.destinationNeedsCreate,
    product: input.product,
    contract_number: input.contractNumber,
    lot_kg: input.lotKg,
    classifier_name: input.classifierName,
    producer_name: input.producerName,
    notes: input.notes,
    status,
    created_by_user_id: existing?.createdByUserId ?? input.createdByUserId ?? null,
    created_by_name: existing?.createdByName ?? input.createdByName ?? null,
    updated_at: now,
  }

  const { data, error } = await sb
    .from('operation_service_order_drafts')
    .upsert(payload, { onConflict: 'id' })
    .select(COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  await rememberDraftOptions(input)
  return fromRow(data as ServiceOrderDraftRow)
}

export const queueServiceOrderDraft = async (id: string): Promise<ServiceOrderDraft> => {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .update({
      status: 'pendente_envio',
      bot_error: null,
      sent_at: now,
      updated_at: now,
    })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromRow(data as ServiceOrderDraftRow)
}

export const listQueuedServiceOrderDrafts = async (limit = 5): Promise<ServiceOrderDraft[]> => {
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .select(COLUMNS)
    .eq('status', 'pendente_envio')
    .order('sent_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 20)))
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => fromRow(row as ServiceOrderDraftRow))
}

export const markServiceOrderProcessing = async (id: string): Promise<ServiceOrderDraft> => {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .update({ status: 'enviando', bot_error: null, updated_at: now })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromRow(data as ServiceOrderDraftRow)
}

export const markServiceOrderCreated = async (
  id: string,
  classificOsId: string | null,
): Promise<ServiceOrderDraft> => {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .update({
      status: 'criada',
      classific_os_id: classificOsId,
      bot_error: null,
      updated_at: now,
    })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromRow(data as ServiceOrderDraftRow)
}

export const markServiceOrderError = async (id: string, message: string): Promise<ServiceOrderDraft> => {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('operation_service_order_drafts')
    .update({
      status: 'erro',
      bot_error: message.slice(0, 800),
      updated_at: now,
    })
    .eq('id', id)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromRow(data as ServiceOrderDraftRow)
}

export const deleteServiceOrderDraft = async (id: string): Promise<void> => {
  const { error } = await getSupabase().from('operation_service_order_drafts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
