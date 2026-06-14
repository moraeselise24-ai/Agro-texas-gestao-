import crypto from 'crypto'
import type { RecurrenceFrequency, Revenue, RevenueCategory, RevenueStatus } from '../types.js'
import { getSupabase } from '../supabase.js'

type RevenueRow = {
  id: string
  date: string
  category: string
  client_name: string | null
  description: string
  amount_brl: number
  payment_method: string | null
  document_number: string | null
  due_date: string | null
  expected_receipt_date: string | null
  received_at: string | null
  status: RevenueStatus | null
  is_recurring: boolean | null
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_until: string | null
  notes: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string | null
  updated_at: string | null
}

type RevenueCategoryRow = {
  id: string
  name: string
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

const REVENUE_COLUMNS =
  'id,date,category,client_name,description,amount_brl,payment_method,document_number,due_date,expected_receipt_date,received_at,status,is_recurring,recurrence_frequency,recurrence_until,notes,created_by_user_id,created_by_name,created_at,updated_at'
const CATEGORY_COLUMNS = 'id,name,active,created_at,updated_at'
const DEFAULT_CATEGORIES = ['Faturamento operacional', 'Receita manual', 'Reembolso', 'Serviço extra', 'Contrato mensal', 'Outros']
const VALID_STATUS = new Set<RevenueStatus>(['prevista', 'a_receber', 'recebida', 'cancelada'])
const VALID_RECURRENCE = new Set<RecurrenceFrequency>(['semanal', 'mensal', 'anual'])

export const isRevenueStatus = (value: string): value is RevenueStatus =>
  VALID_STATUS.has(value as RevenueStatus)

export const isRevenueRecurrenceFrequency = (value: string): value is RecurrenceFrequency =>
  VALID_RECURRENCE.has(value as RecurrenceFrequency)

const makeId = (): string => crypto.randomUUID()
const normalizeName = (name: string): string => name.trim().replace(/\s+/g, ' ')
const slugId = (name: string): string =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || makeId()

const fromCategoryRow = (row: RevenueCategoryRow): RevenueCategory => ({
  id: row.id,
  name: row.name,
  active: row.active ?? true,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

const fromRow = (row: RevenueRow): Revenue => ({
  id: row.id,
  date: row.date,
  category: row.category,
  clientName: row.client_name ?? null,
  description: row.description,
  amountBRL: Number(row.amount_brl ?? 0),
  paymentMethod: row.payment_method ?? null,
  documentNumber: row.document_number ?? null,
  dueDate: row.due_date ?? null,
  expectedReceiptDate: row.expected_receipt_date ?? null,
  receivedAt: row.received_at ?? null,
  status: row.status ?? 'a_receber',
  isRecurring: Boolean(row.is_recurring),
  recurrenceFrequency: row.recurrence_frequency ?? null,
  recurrenceUntil: row.recurrence_until ?? null,
  notes: row.notes ?? null,
  createdByUserId: row.created_by_user_id ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

export const ensureDefaultRevenueCategories = async (): Promise<void> => {
  const rows = DEFAULT_CATEGORIES.map((name) => ({ id: slugId(name), name, active: true, updated_at: new Date().toISOString() }))
  const { error } = await getSupabase().from('operation_revenue_categories').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export const listRevenueCategories = async (): Promise<RevenueCategory[]> => {
  const { data, error } = await getSupabase()
    .from('operation_revenue_categories')
    .select(CATEGORY_COLUMNS)
    .eq('active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  if (!data?.length) {
    await ensureDefaultRevenueCategories()
    return listRevenueCategories()
  }
  return data.map((row) => fromCategoryRow(row as RevenueCategoryRow))
}

export const createRevenueCategory = async (nameRaw: string): Promise<RevenueCategory> => {
  const name = normalizeName(nameRaw)
  if (!name) throw new Error('Nome da categoria é obrigatório')
  const { data, error } = await getSupabase()
    .from('operation_revenue_categories')
    .upsert({ id: slugId(name), name, active: true, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select(CATEGORY_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return fromCategoryRow(data as RevenueCategoryRow)
}

export const deactivateRevenueCategory = async (id: string): Promise<void> => {
  const { error } = await getSupabase()
    .from('operation_revenue_categories')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export const listRevenues = async (args: {
  from?: string
  to?: string
  category?: string
  status?: RevenueStatus
  dateBasis?: 'date' | 'due' | 'expected' | 'received'
  q?: string
  page?: number
  pageSize?: number
}): Promise<{ items: Revenue[]; total: number; totalAmountBRL: number }> => {
  const page = args.page && args.page > 0 ? args.page : 1
  const pageSize = args.pageSize && args.pageSize > 0 ? Math.min(args.pageSize, 5000) : 50
  const offset = (page - 1) * pageSize
  const toIndex = offset + pageSize - 1
  const dateColumn = args.dateBasis === 'due' ? 'due_date' : args.dateBasis === 'expected' ? 'expected_receipt_date' : args.dateBasis === 'received' ? 'received_at' : 'date'
  let base = getSupabase().from('operation_revenues').select(REVENUE_COLUMNS, { count: 'exact' })
  let totalQuery = getSupabase().from('operation_revenues').select('amount_brl')
  if (args.from) { base = base.gte(dateColumn, args.from); totalQuery = totalQuery.gte(dateColumn, args.from) }
  if (args.to) { base = base.lte(dateColumn, args.to); totalQuery = totalQuery.lte(dateColumn, args.to) }
  if (args.category) { base = base.eq('category', args.category); totalQuery = totalQuery.eq('category', args.category) }
  if (args.status) { base = base.eq('status', args.status); totalQuery = totalQuery.eq('status', args.status) }
  if (args.q) {
    const like = `%${args.q}%`
    const filter = `description.ilike.${like},client_name.ilike.${like},document_number.ilike.${like},notes.ilike.${like},category.ilike.${like}`
    base = base.or(filter)
    totalQuery = totalQuery.or(filter)
  }
  const [{ data, count, error }, { data: totalRows, error: totalError }] = await Promise.all([
    base.order('date', { ascending: false }).order('created_at', { ascending: false }).range(offset, toIndex),
    totalQuery.range(0, 9999),
  ])
  if (error) throw new Error(error.message)
  if (totalError) throw new Error(totalError.message)
  const totalAmountBRL = (totalRows ?? []).reduce((acc, row) => acc + (Number((row as { amount_brl?: unknown }).amount_brl ?? 0) || 0), 0)
  return { items: (data ?? []).map((row) => fromRow(row as RevenueRow)), total: count ?? 0, totalAmountBRL }
}

export const listRevenuesForExport = async (args: {
  from?: string
  to?: string
  category?: string
  status?: RevenueStatus
  dateBasis?: 'date' | 'due' | 'expected' | 'received'
  q?: string
}): Promise<{ items: Revenue[]; totalAmountBRL: number }> => {
  const result = await listRevenues({
    ...args,
    page: 1,
    pageSize: 5000,
  })
  return {
    items: result.items,
    totalAmountBRL: result.totalAmountBRL,
  }
}

export const saveRevenue = async (args: {
  id?: string
  date: string
  category: string
  clientName?: string | null
  description: string
  amountBRL: number
  paymentMethod?: string | null
  documentNumber?: string | null
  dueDate?: string | null
  expectedReceiptDate?: string | null
  receivedAt?: string | null
  status: RevenueStatus
  isRecurring?: boolean
  recurrenceFrequency?: RecurrenceFrequency | null
  recurrenceUntil?: string | null
  notes?: string | null
  responsavel?: { userId: string | null; nome: string | null }
}): Promise<Revenue> => {
  const category = normalizeName(args.category)
  await createRevenueCategory(category)
  const row = {
    id: args.id ?? makeId(),
    date: args.date,
    category,
    client_name: args.clientName?.trim() || null,
    description: args.description.trim(),
    amount_brl: args.amountBRL,
    payment_method: args.paymentMethod?.trim() || null,
    document_number: args.documentNumber?.trim() || null,
    due_date: args.dueDate || null,
    expected_receipt_date: args.expectedReceiptDate || null,
    received_at: args.status === 'recebida' ? args.receivedAt || args.expectedReceiptDate || args.date : null,
    status: args.status,
    is_recurring: Boolean(args.isRecurring),
    recurrence_frequency: args.isRecurring ? args.recurrenceFrequency ?? 'mensal' : null,
    recurrence_until: args.isRecurring ? args.recurrenceUntil || null : null,
    notes: args.notes?.trim() || null,
    created_by_user_id: args.responsavel?.userId ?? null,
    created_by_name: args.responsavel?.nome ?? null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await getSupabase().from('operation_revenues').upsert(row, { onConflict: 'id' }).select(REVENUE_COLUMNS).single()
  if (error) throw new Error(error.message)
  return fromRow(data as RevenueRow)
}

export const deleteRevenue = async (id: string): Promise<void> => {
  const { error } = await getSupabase().from('operation_revenues').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
