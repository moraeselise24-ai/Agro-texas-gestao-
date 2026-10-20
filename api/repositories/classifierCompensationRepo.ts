import crypto from 'crypto'
import type {
  ClassifierPaymentEntry,
  ClassifierPaymentType,
  WorkedDayClassifierSummary,
  WorkedDayCompensation,
} from '../types.js'
import { getSupabase } from '../supabase.js'

type RateRow = { classifier_name: string; daily_rate_brl: number }

type PaymentRow = {
  id: string
  classifier_name: string
  period_from: string
  period_to: string
  amount_brl: number
  paid_at: string
  type: ClassifierPaymentType
  notes: string | null
  created_by_name: string | null
  created_at: string | null
}

const RATE_COLUMNS = 'classifier_name,daily_rate_brl'
const PAYMENT_COLUMNS = 'id,classifier_name,period_from,period_to,amount_brl,paid_at,type,notes,created_by_name,created_at'
const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ')

const toPayment = (row: PaymentRow): ClassifierPaymentEntry => ({
  id: row.id,
  classifierName: row.classifier_name,
  periodFrom: row.period_from,
  periodTo: row.period_to,
  amountBRL: Number(row.amount_brl ?? 0),
  paidAt: row.paid_at,
  type: row.type,
  notes: row.notes ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at ?? null,
})

const statusFrom = (args: {
  dailyRateBRL: number | null
  projectedPaymentBRL: number
  paidAmountBRL: number
}): WorkedDayCompensation['paymentStatus'] => {
  if (args.dailyRateBRL == null || args.dailyRateBRL <= 0) return 'a_configurar'
  if (args.paidAmountBRL >= args.projectedPaymentBRL - 0.005) {
    return args.paidAmountBRL > args.projectedPaymentBRL + 0.005 ? 'credito' : 'pago'
  }
  return args.paidAmountBRL > 0 ? 'parcial' : 'pendente'
}

export const getWorkedDaysCompensation = async (args: {
  items: WorkedDayClassifierSummary[]
  from: string
  to: string
}): Promise<Map<string, WorkedDayCompensation>> => {
  const names = args.items.map((item) => normalizeName(item.classifierName)).filter(Boolean)
  const result = new Map<string, WorkedDayCompensation>()
  if (!names.length) return result

  const sb = getSupabase()
  const [ratesResult, paymentsResult] = await Promise.all([
    sb.from('classifier_daily_rates').select(RATE_COLUMNS).in('classifier_name', names),
    sb
      .from('classifier_payment_entries')
      .select(PAYMENT_COLUMNS)
      .in('classifier_name', names)
      .eq('period_from', args.from)
      .eq('period_to', args.to)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  if (ratesResult.error) throw new Error(ratesResult.error.message)
  if (paymentsResult.error) throw new Error(paymentsResult.error.message)

  const rates = new Map(
    (ratesResult.data ?? []).map((row) => {
      const rate = row as RateRow
      return [normalizeName(rate.classifier_name), Number(rate.daily_rate_brl ?? 0)]
    }),
  )
  const paymentsByClassifier = new Map<string, ClassifierPaymentEntry[]>()
  for (const row of paymentsResult.data ?? []) {
    const payment = toPayment(row as PaymentRow)
    const key = normalizeName(payment.classifierName)
    paymentsByClassifier.set(key, [...(paymentsByClassifier.get(key) ?? []), payment])
  }

  for (const item of args.items) {
    const key = normalizeName(item.classifierName)
    const dailyRateBRL = rates.has(key) ? rates.get(key)! : null
    const payments = paymentsByClassifier.get(key) ?? []
    const paidAmountBRL = payments.reduce((sum, payment) => sum + payment.amountBRL, 0)
    const advanceAmountBRL = payments
      .filter((payment) => payment.type === 'adiantamento')
      .reduce((sum, payment) => sum + payment.amountBRL, 0)
    const projectedPaymentBRL = (dailyRateBRL ?? 0) * item.daysWorked
    result.set(key, {
      dailyRateBRL,
      projectedPaymentBRL,
      paidAmountBRL,
      advanceAmountBRL,
      balanceBRL: projectedPaymentBRL - paidAmountBRL,
      paymentStatus: statusFrom({ dailyRateBRL, projectedPaymentBRL, paidAmountBRL }),
      payments,
    })
  }

  return result
}

export const saveClassifierDailyRate = async (args: {
  classifierName: string
  dailyRateBRL: number
}): Promise<number> => {
  const classifierName = normalizeName(args.classifierName)
  if (!classifierName || !Number.isFinite(args.dailyRateBRL) || args.dailyRateBRL <= 0) {
    throw new Error('Informe uma diária válida')
  }
  const { error } = await getSupabase()
    .from('classifier_daily_rates')
    .upsert(
      { classifier_name: classifierName, daily_rate_brl: args.dailyRateBRL, updated_at: new Date().toISOString() },
      { onConflict: 'classifier_name' },
    )
  if (error) throw new Error(error.message)
  return args.dailyRateBRL
}

export const createClassifierPaymentEntry = async (args: {
  classifierName: string
  periodFrom: string
  periodTo: string
  amountBRL: number
  paidAt: string
  type: ClassifierPaymentType
  notes: string | null
  createdByUserId: string | null
  createdByName: string | null
}): Promise<ClassifierPaymentEntry> => {
  const classifierName = normalizeName(args.classifierName)
  if (!classifierName || !args.periodFrom || !args.periodTo || !args.paidAt || args.amountBRL <= 0) {
    throw new Error('Dados do lançamento inválidos')
  }
  const { data, error } = await getSupabase()
    .from('classifier_payment_entries')
    .insert({
      id: crypto.randomUUID(), classifier_name: classifierName, period_from: args.periodFrom, period_to: args.periodTo,
      amount_brl: args.amountBRL, paid_at: args.paidAt, type: args.type, notes: args.notes,
      created_by_user_id: args.createdByUserId, created_by_name: args.createdByName,
    })
    .select(PAYMENT_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return toPayment(data as PaymentRow)
}

export const deleteClassifierPaymentEntry = async (id: string): Promise<void> => {
  const { error } = await getSupabase().from('classifier_payment_entries').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
