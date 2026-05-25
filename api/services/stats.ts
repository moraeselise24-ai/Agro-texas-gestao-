import type { BillingRules, OsRecord, StatsResponse } from '../types.js'
import { buildOsDayCharges, estimateRevenueForRecords } from './billing.js'
import {
  countActiveOs,
  filterMovementRecords,
  hasMovement,
  isRneRecord,
} from './movement.js'
import { aggregateTonsByOsDay, dedupeVolumeByOsDay } from './volume.js'

const toMonthKey = (isoDate: string) => isoDate.slice(0, 7)

const parseRecordTimestamp = (record: OsRecord): string | null => {
  const match = record.id.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (match) {
    const [, day, month, year, hour, minute, second] = match
    return `20${year}-${month}-${day}T${hour}:${minute}:${second}`
  }

  return record.date ? `${record.date}T00:00:00` : null
}

const getLastUpdatedAt = (records: OsRecord[]): string | null => {
  let latest: string | null = null
  for (const record of records) {
    if (record.id.startsWith('OSDAY-')) continue
    const timestamp = parseRecordTimestamp(record)
    if (!timestamp) continue
    if (!latest || timestamp > latest) latest = timestamp
  }
  return latest
}

export const buildStats = (records: OsRecord[], rules: BillingRules, range: { from: string; to: string }): StatsResponse => {
  const movementRecords = filterMovementRecords(records)
  const volumeRecords = dedupeVolumeByOsDay(movementRecords)
  const osCount = countActiveOs(movementRecords)
  const volume = aggregateTonsByOsDay(movementRecords)
  const tonsTotal = volume.total
  const lastUpdatedAt = getLastUpdatedAt(movementRecords)

  const byDay = volume.byDay
  const rneByDay = new Map<string, number>()
  const byMonth = new Map<string, number>()
  const byClient = new Map<string, number>()
  const revenueByClient = new Map<string, number>()
  const byPoint = new Map<string, number>()
  const revenueByPoint = new Map<string, number>()

  for (const r of volumeRecords) {
    byMonth.set(toMonthKey(r.date), (byMonth.get(toMonthKey(r.date)) ?? 0) + (r.tons ?? 0))
    byClient.set(r.clientName, (byClient.get(r.clientName) ?? 0) + (r.tons ?? 0))
    byPoint.set(r.embarkPoint, (byPoint.get(r.embarkPoint) ?? 0) + (r.tons ?? 0))
  }

  for (const r of records) {
    if (!hasMovement(r) || !isRneRecord(r)) continue
    rneByDay.set(r.date, (rneByDay.get(r.date) ?? 0) + 1)
  }

  const tonsDailySeries = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tons]) => ({ date, tons }))

  const tonsMonthlySeries = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, tons]) => ({ month, tons }))

  const rneSeries = [...rneByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  const revenue = estimateRevenueForRecords(volumeRecords, rules, movementRecords)
  const charges = buildOsDayCharges(volumeRecords, movementRecords, rules)
  for (const charge of charges) {
    revenueByClient.set(
      charge.clientName,
      (revenueByClient.get(charge.clientName) ?? 0) + charge.revenueEstimatedBRL,
    )
    revenueByPoint.set(
      charge.embarkPoint,
      (revenueByPoint.get(charge.embarkPoint) ?? 0) + charge.revenueEstimatedBRL,
    )
  }

  const breakdownByClient = [...byClient.entries()]
    .map(([clientName, tons]) => ({
      clientName,
      tons,
      revenueEstimatedBRL: revenueByClient.get(clientName) ?? 0,
    }))
    .sort((a, b) => b.tons - a.tons)
    .slice(0, 20)

  const breakdownByPoint = [...byPoint.entries()]
    .map(([embarkPoint, tons]) => ({
      embarkPoint,
      tons,
      revenueEstimatedBRL: revenueByPoint.get(embarkPoint) ?? 0,
    }))
    .sort((a, b) => b.tons - a.tons)

  return {
    range,
    kpis: {
      osCount,
      tonsTotal,
      dailyFeeCount: revenue.dailyFeeCount,
      tonsDailySeries,
      tonsMonthlySeries,
      rneSeries,
      revenueEstimatedBRL: revenue.revenueEstimatedBRL,
      lastUpdatedAt,
    },
    breakdowns: {
      byClient: breakdownByClient,
      byEmbarkPoint: breakdownByPoint,
    },
  }
}
