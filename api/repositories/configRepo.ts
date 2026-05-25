import type { BillingRules } from '../types.js'
import { getSupabase } from '../supabase.js'

type BillingRulesRow = {
  id: number
  daily_fee_brl: number
  base_tariff_brl_per_ton: number
  min_cadence_tons: number
  excess_multiplier: number
}

const defaultRulesRow: BillingRulesRow = {
  id: 1,
  daily_fee_brl: 400,
  base_tariff_brl_per_ton: 2,
  min_cadence_tons: 200,
  excess_multiplier: 2,
}

const ensureBillingRules = async (): Promise<BillingRulesRow> => {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('billing_rules')
    .select('id,daily_fee_brl,base_tariff_brl_per_ton,min_cadence_tons,excess_multiplier')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data) return data as BillingRulesRow

  const upserted = await sb.from('billing_rules').upsert(defaultRulesRow, { onConflict: 'id' }).select().single()
  if (upserted.error) throw new Error(upserted.error.message)
  return upserted.data as BillingRulesRow
}

export const getBillingRules = async (): Promise<BillingRules> => {
  const row = await ensureBillingRules()
  return {
    dailyFeeBRL: row.daily_fee_brl,
    baseTariffBRLPerTon: row.base_tariff_brl_per_ton,
    minCadenceTons: row.min_cadence_tons,
    excessMultiplier: row.excess_multiplier,
  }
}

export const updateBillingRules = async (rules: BillingRules): Promise<void> => {
  const sb = getSupabase()
  const row: BillingRulesRow = {
    id: 1,
    daily_fee_brl: rules.dailyFeeBRL,
    base_tariff_brl_per_ton: rules.baseTariffBRLPerTon,
    min_cadence_tons: rules.minCadenceTons,
    excess_multiplier: rules.excessMultiplier,
  }
  const { error } = await sb.from('billing_rules').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(error.message)
}
