import type { BillingRules, OsRecord, StatsResponse } from '../types.js'
import { buildOsDayCharges, estimateRevenueForRecords } from './billing.js'
import {
  countActiveOs,
  filterMovementRecords,
  getOsKey,
  hasMovement,
  isRneRecord,
} from './movement.js'
import { aggregateTonsByOsDay, dedupeVolumeByOsDay } from './volume.js'

const toMonthKey = (isoDate: string) => isoDate.slice(0, 7)

const normalizeClientKey = (clientName: string): string => {
  const [base] = clientName.split(',')
  return (base || clientName).trim().toUpperCase()
}

const clientLabelFromKey = (clientKey: string): string => clientKey

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
  const loadCount = movementRecords.filter(
    (record) => !isRneRecord(record) && !record.id.startsWith('OSDAY-') && (record.tons ?? 0) > 0,
  ).length

  const byDay = volume.byDay
  const dailyFeeByDay = new Map<string, number>()
  const revenueByDay = new Map<string, number>()
  const rneByDay = new Map<string, number>()
  const byMonth = new Map<string, number>()
  const byClient = new Map<string, number>()
  const revenueByClient = new Map<string, number>()
  const clientLabels = new Map<string, string>()
  const byPoint = new Map<string, number>()
  const revenueByPoint = new Map<string, number>()
  const byClassifier = new Map<string, number>()
  const byOs = new Map<string, { osId: string; clientName: string; embarkPoint: string; tons: number }>()

  for (const r of volumeRecords) {
    const clientKey = normalizeClientKey(r.clientName)
    const osId = getOsKey(r)
    byMonth.set(toMonthKey(r.date), (byMonth.get(toMonthKey(r.date)) ?? 0) + (r.tons ?? 0))
    byClient.set(clientKey, (byClient.get(clientKey) ?? 0) + (r.tons ?? 0))
    clientLabels.set(clientKey, clientLabelFromKey(clientKey))
    byPoint.set(r.embarkPoint, (byPoint.get(r.embarkPoint) ?? 0) + (r.tons ?? 0))
    if (osId) {
      const current = byOs.get(osId)
      byOs.set(osId, {
        osId,
        clientName: current?.clientName ?? r.clientName,
        embarkPoint: current?.embarkPoint ?? r.embarkPoint,
        tons: (current?.tons ?? 0) + (r.tons ?? 0),
      })
    }
    if (r.classifierName?.trim()) {
      const classifierName = r.classifierName.trim()
      byClassifier.set(classifierName, (byClassifier.get(classifierName) ?? 0) + (r.tons ?? 0))
    }
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
    const clientKey = normalizeClientKey(charge.clientName)
    dailyFeeByDay.set(charge.date, (dailyFeeByDay.get(charge.date) ?? 0) + 1)
    revenueByDay.set(
      charge.date,
      (revenueByDay.get(charge.date) ?? 0) + charge.revenueEstimatedBRL,
    )
    revenueByClient.set(
      clientKey,
      (revenueByClient.get(clientKey) ?? 0) + charge.revenueEstimatedBRL,
    )
    clientLabels.set(clientKey, clientLabelFromKey(clientKey))
    revenueByPoint.set(
      charge.embarkPoint,
      (revenueByPoint.get(charge.embarkPoint) ?? 0) + charge.revenueEstimatedBRL,
    )
  }

  const dailyFeeSeries = [...dailyFeeByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  const revenueDailySeries = [...revenueByDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  const clientKeys = new Set([...byClient.keys(), ...revenueByClient.keys()])
  const breakdownByClient = [...clientKeys]
    .map((clientKey) => ({
      clientName: clientLabels.get(clientKey) ?? clientKey,
      tons: byClient.get(clientKey) ?? 0,
      revenueEstimatedBRL: revenueByClient.get(clientKey) ?? 0,
    }))
    .sort((a, b) => b.revenueEstimatedBRL - a.revenueEstimatedBRL)
    .slice(0, 20)

  const breakdownByPoint = [...byPoint.entries()]
    .map(([embarkPoint, tons]) => ({
      embarkPoint,
      tons,
      revenueEstimatedBRL: revenueByPoint.get(embarkPoint) ?? 0,
    }))
    .sort((a, b) => b.tons - a.tons)

  const breakdownByClassifier = [...byClassifier.entries()]
    .map(([classifierName, tons]) => ({ classifierName, tons }))
    .sort((a, b) => b.tons - a.tons)

  const breakdownByOs = [...byOs.values()]
    .sort((a, b) => b.tons - a.tons)
    .slice(0, 20)

  const daysWithVolume = byDay.size
  const avgTonsPerOs = osCount > 0 ? tonsTotal / osCount : 0
  const avgTonsPerDay = daysWithVolume > 0 ? tonsTotal / daysWithVolume : 0

  return {
    range,
    kpis: {
      osCount,
      tonsTotal,
      dailyFeeCount: revenue.dailyFeeCount,
      tonsDailySeries,
      dailyFeeSeries,
      revenueDailySeries,
      tonsMonthlySeries,
      rneSeries,
      revenueEstimatedBRL: revenue.revenueEstimatedBRL,
      lastUpdatedAt,
      loadCount,
      avgTonsPerOs,
      avgTonsPerDay,
    },
    breakdowns: {
      byClient: breakdownByClient,
      byEmbarkPoint: breakdownByPoint,
      byClassifier: breakdownByClassifier,
      byOs: breakdownByOs,
    },
  }
}
