import dotenv from 'dotenv'
import { collectClassificadores } from './collector/classificadoresCollector.js'
import { upsertClassificadores } from './repositories/classificadoresRepo.js'
import { runCollectJob } from './services/runCollect.js'

dotenv.config({ path: '.env.local' })
dotenv.config()

console.log(`[local-collector] Iniciando coleta em ${new Date().toISOString()}`)

runCollectJob()
  .then(async (result) => {
    const classificadores = await collectClassificadores()
    await upsertClassificadores(classificadores)
    console.log(
      `[local-collector] OK importados=${result.imported} laudos=${result.laudos} rne=${result.rne} clientes=${result.clientsSynced} classificadores=${classificadores.length} removidos_laudos=${result.removedStaleLaudos} removidos_rne=${result.removedStaleRne}`,
    )
    if (result.clientsSyncError) console.warn(`[local-collector] Clientes: ${result.clientsSyncError}`)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[local-collector] Falha: ${message}`)
    process.exitCode = 1
  })
