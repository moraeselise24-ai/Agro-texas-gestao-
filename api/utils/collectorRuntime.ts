import type { Response } from 'express'

export const isHostedPanelRuntime = (): boolean =>
  process.env.NETLIFY === 'true' || process.env.COLLECTOR_RUNS_LOCALLY === 'true'

export const rejectHostedCollector = (res: Response): void => {
  res.status(409).json({
    success: false,
    error: 'A coleta ocorre na máquina local. Aguarde a próxima sincronização.',
  })
}
