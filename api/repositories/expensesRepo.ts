import crypto from 'crypto'
import type {
  Expense,
  ExpenseCategory,
  ExpenseStatus,
  RecurrenceFrequency,
} from '../types.js'
import { getSupabase } from '../supabase.js'

type ExpenseRow = {
  id: string
  date: string
  category: string
  description: string
  supplier: string | null
  amount_brl: number
  payment_method: string | null
  document_number: string | null
  due_date: string | null
  scheduled_payment_date: string | null
  paid_at: string | null
  status: ExpenseStatus | null
  is_recurring: boolean | null
  recurrence_frequency: RecurrenceFrequency | null
  recurrence_until: string | null
  notes: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string | null
  updated_at: string | null
}

type ExpenseCategoryRow = {
  id: string
  name: string
  active: boolean | null
  created_at: string | null
  updated_at: string | null
}

const EXPENSE_COLUMNS =
  'id,date,category,description,supplier,amount_brl,payment_method,document_number,due_date,scheduled_payment_date,paid_at,status,is_recurring,recurrence_frequency,recurrence_until,notes,created_by_user_id,created_by_name,created_at,updated_at'

const CATEGORY_COLUMNS = 'id,name,active,created_at,updated_at'

const DEFAULT_CATEGORIES = [
  'Funcionários',
  'Restaurantes',
  'Hospedagem',
  'Combustíveis',
  'Contador',
  'Frota',
  'Convênios',
  'Outros',
]

const VALID_STATUS = new Set<ExpenseStatus>(['agendada', 'a_pagar', 'paga', 'cancelada'])
const VALID_RECURRENCE = new Set<RecurrenceFrequency>(['semanal', 'mensal', 'anual'])

export const isExpenseStatus = (value: string): value is ExpenseStatus =>
  VALID_STATUS.has(value as ExpenseStatus)

export const isRecurrenceFrequency = (value: string): value is RecurrenceFrequency =>
  VALID_RECURRENCE.has(value as RecurrenceFrequency)

const makeId = (): string => crypto.randomUUID()

const slugCategoryId = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || makeId()

const normalizeCategoryName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ')

const fromCategoryRow = (row: ExpenseCategoryRow): ExpenseCategory => ({
  id: row.id,
  name: row.name,
  active: row.active ?? true,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

const fromRow = (row: ExpenseRow): Expense => ({
  id: row.id,
  date: row.date,
  category: row.category,
  description: row.description,
  supplier: row.supplier ?? null,
  amountBRL: Number(row.amount_brl ?? 0),
  paymentMethod: row.payment_method ?? null,
  documentNumber: row.document_number ?? null,
  dueDate: row.due_date ?? null,
  scheduledPaymentDate: row.scheduled_payment_date ?? null,
  paidAt: row.paid_at ?? null,
  status: row.status ?? 'a_pagar',
  isRecurring: Boolean(row.is_recurring),
  recurrenceFrequency: row.recurrence_frequency ?? null,
  recurrenceUntil: row.recurrence_until ?? null,
  notes: row.notes ?? null,
  createdByUserId: row.created_by_user_id ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null,
})

export const ensureDefaultExpenseCategories = async (): Promise<void> => {
  const sb = getSupabase()
  const rows = DEFAULT_CATEGORIES.map((name) => ({
    id: slugCategoryId(name),
    name,
    active: true,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await sb.from('operation_expense_categories').upsert(rows, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export const listExpenseCategories = async (): Promise<ExpenseCategory[]> => {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('operation_expense_categories')
    .select(CATEGORY_COLUMNS)
    .eq('active', true)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)

  if (!data?.length) {
    await ensureDefaultExpenseCategories()
    return listExpenseCategories()
  }

  return data.map((row) => fromCategoryRow(row as ExpenseCategoryRow))
}

export const createExpenseCategory = async (nameRaw: string): Promise<ExpenseCategory> => {
  const sb = getSupabase()
  const name = normalizeCategoryName(nameRaw)
  if (!name) throw new Error('Nome da categoria é obrigatório')
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('operation_expense_categories')
    .upsert(
      {
        id: slugCategoryId(name),
        name,
        active: true,
        updated_at: now,
      },
      { onConflict: 'id' },
    )
    .select(CATEGORY_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return fromCategoryRow(data as ExpenseCategoryRow)
}

export const deactivateExpenseCategory = async (id: string): Promise<void> => {
  const sb = getSupabase()
  const { error } = await sb
    .from('operation_expense_categories')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export const listExpenses = async (args: {
  from?: string
  to?: string
  category?: string
  status?: ExpenseStatus
  dateBasis?: 'date' | 'due' | 'scheduled' | 'paid'
  q?: string
  page?: number
  pageSize?: number
}): Promise<{ items: Expense[]; total: number; totalAmountBRL: number }> => {
  const sb = getSupabase()
  const page = args.page && args.page > 0 ? args.page : 1
  const pageSize = args.pageSize && args.pageSize > 0 ? Math.min(args.pageSize, 5000) : 50
  const offset = (page - 1) * pageSize
  const toIndex = offset + pageSize - 1

  let base = sb.from('operation_expenses').select(EXPENSE_COLUMNS, { count: 'exact' })
  let totalQuery = sb.from('operation_expenses').select('amount_brl')
  const dateColumn =
    args.dateBasis === 'due'
      ? 'due_date'
      : args.dateBasis === 'scheduled'
        ? 'scheduled_payment_date'
        : args.dateBasis === 'paid'
          ? 'paid_at'
          : 'date'

  if (args.from) {
    base = base.gte(dateColumn, args.from)
    totalQuery = totalQuery.gte(dateColumn, args.from)
  }
  if (args.to) {
    base = base.lte(dateColumn, args.to)
    totalQuery = totalQuery.lte(dateColumn, args.to)
  }
  if (args.category) {
    base = base.eq('category', args.category)
    totalQuery = totalQuery.eq('category', args.category)
  }
  if (args.status) {
    base = base.eq('status', args.status)
    totalQuery = totalQuery.eq('status', args.status)
  }
  if (args.q) {
    const like = `%${args.q}%`
    const filter = `description.ilike.${like},supplier.ilike.${like},document_number.ilike.${like},notes.ilike.${like},category.ilike.${like}`
    base = base.or(filter)
    totalQuery = totalQuery.or(filter)
  }

  const [{ data, count, error }, { data: totalRows, error: totalError }] = await Promise.all([
    base.order('date', { ascending: false }).order('created_at', { ascending: false }).range(offset, toIndex),
    totalQuery.range(0, 9999),
  ])

  if (error) throw new Error(error.message)
  if (totalError) throw new Error(totalError.message)

  const totalAmountBRL = (totalRows ?? []).reduce((acc, row) => {
    const value = Number((row as { amount_brl?: unknown }).amount_brl ?? 0)
    return acc + (Number.isFinite(value) ? value : 0)
  }, 0)

  return {
    items: (data ?? []).map((row) => fromRow(row as ExpenseRow)),
    total: count ?? 0,
    totalAmountBRL,
  }
}

export const listExpensesForExport = async (args: {
  from?: string
  to?: string
  category?: string
  status?: ExpenseStatus
  dateBasis?: 'date' | 'due' | 'scheduled' | 'paid'
  q?: string
}): Promise<{ items: Expense[]; totalAmountBRL: number }> => {
  const result = await listExpenses({
    ...args,
    page: 1,
    pageSize: 5000,
  })
  return {
    items: result.items,
    totalAmountBRL: result.totalAmountBRL,
  }
}

export const saveExpense = async (args: {
  id?: string
  date: string
  category: string
  description: string
  supplier?: string | null
  amountBRL: number
  paymentMethod?: string | null
  documentNumber?: string | null
  dueDate?: string | null
  scheduledPaymentDate?: string | null
  paidAt?: string | null
  status: ExpenseStatus
  isRecurring?: boolean
  recurrenceFrequency?: RecurrenceFrequency | null
  recurrenceUntil?: string | null
  notes?: string | null
  responsavel?: { userId: string | null; nome: string | null }
}): Promise<Expense> => {
  const sb = getSupabase()
  const id = args.id ?? makeId()
  const now = new Date().toISOString()
  const category = normalizeCategoryName(args.category)
  await createExpenseCategory(category)

  const row = {
    id,
    date: args.date,
    category,
    description: args.description.trim(),
    supplier: args.supplier?.trim() || null,
    amount_brl: args.amountBRL,
    payment_method: args.paymentMethod?.trim() || null,
    document_number: args.documentNumber?.trim() || null,
    due_date: args.dueDate || null,
    scheduled_payment_date: args.scheduledPaymentDate || null,
    paid_at: args.status === 'paga' ? args.paidAt || args.scheduledPaymentDate || args.date : null,
    status: args.status,
    is_recurring: Boolean(args.isRecurring),
    recurrence_frequency: args.isRecurring ? args.recurrenceFrequency ?? 'mensal' : null,
    recurrence_until: args.isRecurring ? args.recurrenceUntil || null : null,
    notes: args.notes?.trim() || null,
    created_by_user_id: args.responsavel?.userId ?? null,
    created_by_name: args.responsavel?.nome ?? null,
    updated_at: now,
  }

  const { data, error } = await sb
    .from('operation_expenses')
    .upsert(row, { onConflict: 'id' })
    .select(EXPENSE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return fromRow(data as ExpenseRow)
}

export const deleteExpense = async (id: string): Promise<void> => {
  const sb = getSupabase()
  const { error } = await sb.from('operation_expenses').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
