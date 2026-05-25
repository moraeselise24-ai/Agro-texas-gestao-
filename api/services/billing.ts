import type { BillingRules, OsRecord } from '../types.js'
import { getOsKey } from './movement.js'

export const estimateOsDayRevenueForTons = (tons: number, rules: BillingRules): number => {
  const base = rules.dailyFeeBRL
  const excessTons = Math.max(0, tons - rules.minCadenceTons)
  const excessMultiplier = rules.excessMultiplier > 0 ? rules.excessMultiplier : 1
  const excess = excessTons * rules.baseTariffBRLPerTon * excessMultiplier
  return base + excess
}

export const estimateTariffRevenueForTons = estimateOsDayRevenueForTons

export const estimateDailyFeeCount = (records: OsRecord[]): number => {
  const set = new Set<string>()
  for (const r of records) {
    const osNumber = getOsKey(r)
    if (!osNumber) continue
    set.add(`${r.date}::${osNumber}`)
  }
  return set.size
}

export type OsDayCharge = {
  key: string
  date: string
  osNumber: string
  clientName: string
  embarkPoint: string
  tons: number
  revenueEstimatedBRL: number
}

export const buildOsDayCharges = (
  volumeRecords: OsRecord[],
  dailyRecords: OsRecord[],
  rules: BillingRules,
): OsDayCharge[] => {
  const byKey = new Map<string, Omit<OsDayCharge, 'tons' | 'revenueEstimatedBRL'>>()
  const tonsByKey = new Map<string, number>()

  const ensureKey = (record: OsRecord): string | null => {
    const osNumber = getOsKey(record)
    if (!osNumber) return null

    const key = `${record.date}::${osNumber}`
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        date: record.date,
        osNumber,
        clientName: record.clientName,
        embarkPoint: record.embarkPoint,
      })
    }
    return key
  }

  for (const record of dailyRecords) {
    ensureKey(record)
  }

  for (const record of volumeRecords) {
    const key = ensureKey(record)
    if (!key) continue
    tonsByKey.set(key, (tonsByKey.get(key) ?? 0) + (record.tons ?? 0))
  }

  return [...byKey.values()].map((record) => {
    const tons = tonsByKey.get(record.key) ?? 0
    return {
      ...record,
      tons,
      revenueEstimatedBRL: estimateOsDayRevenueForTons(tons, rules),
    }
  })
}

export const estimateRevenueForRecords = (
  volumeRecords: OsRecord[],
  rules: BillingRules,
  dailyRecords: OsRecord[] = volumeRecords,
): { dailyFeeCount: number; revenueEstimatedBRL: number } => {
  const charges = buildOsDayCharges(volumeRecords, dailyRecords, rules)
  const revenueEstimatedBRL = charges.reduce((sum, charge) => sum + charge.revenueEstimatedBRL, 0)

  return { dailyFeeCount: charges.length, revenueEstimatedBRL }
}
