import { Router, type Request, type Response } from 'express'
import { upsertOsRecords } from '../repositories/osRepo.js'
import type { OsRecord } from '../types.js'

const router = Router()

const pad2 = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const sample = (): OsRecord[] => {
  const today = new Date()
  const clients = ['Cliente A', 'Cliente B', 'Cliente C', 'Cliente D']
  const points = ['Ponto 01', 'Ponto 02', 'Ponto 03', 'Ponto 04']
  const out: OsRecord[] = []

  for (let i = 0; i < 30; i += 1) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = iso(d)

    const dailyCount = 6 + Math.floor(Math.random() * 10)
    for (let j = 0; j < dailyCount; j += 1) {
      const clientName = clients[(i + j) % clients.length]
      const embarkPoint = points[(j + i * 2) % points.length]
      const tons = 40 + Math.random() * 140
      const rne = 0.6 + Math.random() * 0.8
      const osId = `OS-${date.split('-').join('')}-${j + 1}`
      out.push({
        id: osId,
        osId,
        date,
        clientName,
        embarkPoint,
        plate: null,
        tons: Math.round(tons * 100) / 100,
        rne: Math.round(rne * 100) / 100,
        status: 'Concluída',
      })
    }
  }

  return out
}

router.post('/seed', async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV !== 'development') {
    res.status(404).json({ success: false, error: 'Not found' })
    return
  }

  const records = sample()
  await upsertOsRecords(records)
  res.status(200).json({ success: true, inserted: records.length })
})

export default router
