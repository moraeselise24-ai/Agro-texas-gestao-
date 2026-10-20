import type { Response } from 'express'

export const isHostedPanelRuntime = (): boolean =>
  process.env.NETLIFY === 'true'

export const rejectHostedCollector = (res: Response): void => {
  res.status(409).json({
    success: false,
    error: 'Abra o coletor local nesta máquina para sincronizar agora.',
  })
}
