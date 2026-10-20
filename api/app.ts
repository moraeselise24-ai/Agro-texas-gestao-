/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import configRoutes from './routes/config.js'
import statsRoutes from './routes/stats.js'
import osRoutes from './routes/os.js'
import clientsRoutes from './routes/clients.js'
import importRoutes from './routes/import.js'
import exportRoutes from './routes/export.js'
import collectRoutes from './routes/collect.js'
import demoRoutes from './routes/demo.js'
import usersRoutes from './routes/users.js'
import classificadoresRoutes from './routes/classificadores.js'
import programacoesRoutes from './routes/programacoes.js'
import classificRoutes from './routes/classific.js'
import syncRoutes from './routes/sync.js'
import expensesRoutes from './routes/expenses.js'
import revenuesRoutes from './routes/revenues.js'
import assistantRoutes from './routes/assistant.js'
import assetsRoutes from './routes/assets.js'
import serviceOrdersRoutes from './routes/serviceOrders.js'
import workedDaysRoutes from './routes/workedDays.js'
import plateOccurrencesRoutes from './routes/plateOccurrences.js'

// load env
dotenv.config()

const __dirname = process.cwd()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/config', configRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/os', osRoutes)
app.use('/api/clients', clientsRoutes)
app.use('/api/import', importRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/collect', collectRoutes)
app.use('/api/demo', demoRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/classificadores', classificadoresRoutes)
app.use('/api/programacoes', programacoesRoutes)
app.use('/api/classific', classificRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/expenses', expensesRoutes)
app.use('/api/revenues', revenuesRoutes)
app.use('/api/assistant', assistantRoutes)
app.use('/api/assets', assetsRoutes)
app.use('/api/service-orders', serviceOrdersRoutes)
app.use('/api/worked-days', workedDaysRoutes)
app.use('/api/plate-occurrences', plateOccurrencesRoutes)

app.get('/api/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'ok',
  })
})

const distDir = path.join(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  void next
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
