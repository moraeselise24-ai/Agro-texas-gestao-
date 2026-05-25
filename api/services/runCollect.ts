import { loadCollectorConfigFromEnv, collectFromClassific } from '../collector/classificCollector.js'
import { dedupeOsRecordsById, upsertOsRecords } from '../repositories/osRepo.js'
import { isRneRecord } from './movement.js'

export type CollectRunResult = {
  imported: number
  laudos: number
  rne: number
  duplicatesDropped: number
}

let collectInFlight = false

export const isCollectInFlight = (): boolean => collectInFlight

export const runCollectJob = async (): Promise<CollectRunResult> => {
  if (collectInFlight) {
    throw new Error('Coleta já em execução')
  }

  const cfg = loadCollectorConfigFromEnv()
  if (!cfg) {
    throw new Error('Collector not configured')
  }

  collectInFlight = true
  try {
    const records = await collectFromClassific(cfg)
    const { items, duplicatesDropped } = dedupeOsRecordsById(records)
    await upsertOsRecords(items)
    const rne = items.filter(isRneRecord).length
    const laudos = items.length - rne
    return {
      imported: items.length,
      laudos,
      rne,
      duplicatesDropped,
    }
  } finally {
    collectInFlight = false
  }
}
