import { loadCollectorConfigFromEnv, collectFromClassific } from '../collector/classificCollector.js'
import { collectClientesOptions } from '../collector/clientesCollector.js'
import {
  dedupeOsRecordsById,
  deleteStaleLoadRecords,
  deleteStaleRneRecords,
  upsertOsRecords,
} from '../repositories/osRepo.js'
import { replaceServiceOrderOptionsByType } from '../repositories/serviceOrdersRepo.js'
import { isRneRecord } from './movement.js'

export type CollectRunResult = {
  imported: number
  laudos: number
  rne: number
  duplicatesDropped: number
  removedStaleLaudos: number
  removedStaleRne: number
  clientsSynced: number
  clientsSyncError?: string
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
    const { records, loadSyncDates, rneSyncEnabled, rneSyncDates } = await collectFromClassific(cfg)
    const { items, duplicatesDropped } = dedupeOsRecordsById(records)
    await upsertOsRecords(items)
    const currentLoadIds = items.filter((item) => !isRneRecord(item) && item.tons > 0).map((item) => item.id)
    const currentRneIds = items.filter(isRneRecord).map((item) => item.id)
    const removedStaleLaudos = await deleteStaleLoadRecords({
      dates: loadSyncDates,
      currentLoadIds,
    })
    const removedStaleRne = rneSyncEnabled
      ? await deleteStaleRneRecords({
          dates: [...new Set([...loadSyncDates, ...rneSyncDates])],
          currentRneIds,
        })
      : 0
    let clientsSynced = 0
    let clientsSyncError: string | undefined
    try {
      const clientOptions = await collectClientesOptions()
      clientsSynced = await replaceServiceOrderOptionsByType('client', clientOptions)
    } catch (error) {
      clientsSyncError =
        error instanceof Error ? error.message : 'Falha ao sincronizar clientes do Classific'
    }
    const rne = items.filter(isRneRecord).length
    const laudos = items.length - rne
    return {
      imported: items.length,
      laudos,
      rne,
      duplicatesDropped,
      removedStaleLaudos,
      removedStaleRne,
      clientsSynced,
      ...(clientsSyncError ? { clientsSyncError } : {}),
    }
  } finally {
    collectInFlight = false
  }
}
