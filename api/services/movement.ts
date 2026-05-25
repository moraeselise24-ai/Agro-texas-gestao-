import type { OsRecord } from '../types.js'

export const isRneRecord = (record: OsRecord): boolean =>
  record.id.startsWith('RNE-') || record.status === 'RNE' || record.rne === 1

/** Movimentação no dia: RNE registrado ou volume embarcado (> 0 t). */
export const hasMovement = (record: OsRecord): boolean =>
  isRneRecord(record) || (record.tons ?? 0) > 0

export const normalizeOsNumber = (value: string): string => value.trim().toUpperCase()

export const parseRneOsIdFromRecordId = (id: string): string | null => {
  if (!id.startsWith('RNE-')) return null
  const parts = id.split('-')
  if (parts.length < 5) return null
  const osNumber = parts[4] || ''
  return osNumber ? normalizeOsNumber(osNumber) : null
}

/** Chave única da OS (nº OS). Nunca usa id do laudo — vários laudos = mesma OS. */
export const getOsKey = (record: OsRecord): string | null => {
  const osId = record.osId?.trim()
  if (osId) return normalizeOsNumber(osId)

  if (isRneRecord(record)) return parseRneOsIdFromRecordId(record.id)

  return null
}

/** OS distintas com movimentação no intervalo (cada nº OS conta uma vez). */
export const countActiveOs = (records: OsRecord[]): number => {
  const osNumbers = new Set<string>()
  for (const record of records) {
    if (!hasMovement(record)) continue
    const osNumber = getOsKey(record)
    if (osNumber) osNumbers.add(osNumber)
  }
  return osNumbers.size
}

export const filterMovementRecords = (records: OsRecord[]): OsRecord[] =>
  records.filter(hasMovement)
