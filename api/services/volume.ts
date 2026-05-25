import type { OsRecord } from '../types.js'
import { getOsKey, hasMovement, isRneRecord } from './movement.js'

export const OS_DAY_VOLUME_ID_PREFIX = 'OSDAY-'

const isOsDayVolumeSnapshot = (record: OsRecord): boolean =>
  record.id.startsWith(OS_DAY_VOLUME_ID_PREFIX)

const osDayKey = (record: OsRecord): string => {
  const osNumber = getOsKey(record) ?? record.osId?.trim() ?? record.id
  return `${record.date}::${osNumber}`
}

const shouldSumLaudosPeso = (): boolean => Boolean(process.env.CLASSIFIC_LAUDOS_TONS_COL?.trim())
const shouldUseOsDayVolumeSnapshots = (): boolean =>
  Boolean(process.env.CLASSIFIC_OS_EMBARCADO_HOJE_COL?.trim())

/** Volume por OS e dia. Com Peso do laudo: soma caminhões; sem isso: 1 valor por OS (evita duplicar total da OS). */
export const aggregateTonsByOsDay = (
  records: OsRecord[],
): { total: number; byDay: Map<string, number> } => {
  const tonsByOsDay = new Map<string, number>()
  const snapshotKeys = new Set<string>()
  const sumPeso = shouldSumLaudosPeso()
  const useSnapshots = shouldUseOsDayVolumeSnapshots()

  for (const record of records) {
    if (!hasMovement(record) || isRneRecord(record)) continue
    const tons = record.tons ?? 0
    if (tons <= 0) continue

    const key = osDayKey(record)
    if (isOsDayVolumeSnapshot(record)) {
      if (!useSnapshots) continue
      snapshotKeys.add(key)
      tonsByOsDay.set(key, tons)
    } else if (snapshotKeys.has(key)) {
      continue
    } else if (sumPeso) {
      tonsByOsDay.set(key, (tonsByOsDay.get(key) ?? 0) + tons)
    } else {
      tonsByOsDay.set(key, Math.max(tonsByOsDay.get(key) ?? 0, tons))
    }
  }

  const byDay = new Map<string, number>()
  let total = 0
  for (const [key, tons] of tonsByOsDay) {
    const date = key.slice(0, 10)
    byDay.set(date, (byDay.get(date) ?? 0) + tons)
    total += tons
  }

  return { total, byDay }
}

/** Um registro por OS e dia para faturamento (soma dos laudos ou maior valor). */
export const dedupeVolumeByOsDay = (records: OsRecord[]): OsRecord[] => {
  const sumPeso = shouldSumLaudosPeso()
  const useSnapshots = shouldUseOsDayVolumeSnapshots()
  const byKey = new Map<string, OsRecord>()
  const snapshotKeys = new Set<string>()

  for (const record of records) {
    if (!hasMovement(record) || isRneRecord(record)) continue
    const tons = record.tons ?? 0
    if (tons <= 0) continue

    const key = osDayKey(record)
    if (isOsDayVolumeSnapshot(record)) {
      if (!useSnapshots) continue
      snapshotKeys.add(key)
      byKey.set(key, { ...record })
      continue
    }
    if (snapshotKeys.has(key)) continue

    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...record })
      continue
    }
    if (sumPeso) {
      byKey.set(key, { ...prev, tons: (prev.tons ?? 0) + tons })
    } else if (tons > (prev.tons ?? 0)) {
      byKey.set(key, record)
    }
  }

  return [...byKey.values()]
}
