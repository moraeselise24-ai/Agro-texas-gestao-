import cron from 'node-cron'
import { runCollectJob } from '../services/runCollect.js'

/** 7h, 10h, 13h, 16h e 19h — horário de Cuiabá (MT). */
const DEFAULT_CRON = '0 7,10,13,16,19 * * *'
const DEFAULT_TZ = 'America/Cuiaba'

const isScheduleEnabled = (): boolean => {
  const flag = process.env.COLLECT_SCHEDULE_ENABLED?.trim().toLowerCase()
  if (flag === 'false' || flag === '0' || flag === 'no') return false
  if (flag === 'true' || flag === '1' || flag === 'yes') return true
  return process.env.NODE_ENV === 'production'
}

export const startCollectSchedule = (): void => {
  if (!isScheduleEnabled()) {
    console.log('[collect-schedule] Agendamento desativado (COLLECT_SCHEDULE_ENABLED)')
    return
  }

  const expression = process.env.COLLECT_SCHEDULE_CRON?.trim() || DEFAULT_CRON
  const timezone = process.env.COLLECT_SCHEDULE_TZ?.trim() || DEFAULT_TZ

  if (!cron.validate(expression)) {
    console.error(`[collect-schedule] CRON inválido: ${expression}`)
    return
  }

  cron.schedule(
    expression,
    () => {
      const startedAt = new Date().toISOString()
      console.log(`[collect-schedule] Iniciando coleta automática (${startedAt})`)
      runCollectJob()
        .then((result) => {
          console.log(
            `[collect-schedule] OK importados=${result.imported} laudos=${result.laudos} rne=${result.rne} removidos_laudos=${result.removedStaleLaudos} removidos_rne=${result.removedStaleRne}`,
          )
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (message === 'Coleta já em execução') {
            console.log('[collect-schedule] Coleta já em execução; ignorando disparo')
            return
          }
          console.error(`[collect-schedule] Falha: ${message}`)
        })
    },
    { timezone },
  )

  console.log(
    `[collect-schedule] Ativo (${expression}, ${timezone}) — 7h às 19h (Cuiabá/MT) a cada 3h`,
  )
}
