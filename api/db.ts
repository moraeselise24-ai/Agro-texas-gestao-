import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sqlite3 from 'sqlite3'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const defaultDataDir = path.join(__dirname, '..', 'data')
const defaultDbPath = path.join(defaultDataDir, 'inspectcheck.db')
const dbPath = process.env.INSPECTCHECK_DB_PATH
  ? path.resolve(process.env.INSPECTCHECK_DB_PATH)
  : defaultDbPath
const dataDir = path.dirname(dbPath)

type SqlParams = Array<string | number | null>

export type Db = {
  run: (sql: string, params?: SqlParams) => Promise<void>
  get: <T>(sql: string, params?: SqlParams) => Promise<T | undefined>
  all: <T>(sql: string, params?: SqlParams) => Promise<T[]>
}

const createDb = (): Db => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }

  const db = new sqlite3.Database(dbPath)

  const run = (sql: string, params: SqlParams = []) =>
    new Promise<void>((resolve, reject) => {
      db.run(sql, params, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })

  const get = <T>(sql: string, params: SqlParams = []) =>
    new Promise<T | undefined>((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err)
          return
        }
        resolve(row as T | undefined)
      })
    })

  const all = <T>(sql: string, params: SqlParams = []) =>
    new Promise<T[]>((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err)
          return
        }
        resolve((rows ?? []) as T[])
      })
    })

  return { run, get, all }
}

export const db = createDb()

export const initDb = async () => {
  await db.run(
    `
    CREATE TABLE IF NOT EXISTS os_records (
      id TEXT PRIMARY KEY,
      os_id TEXT,
      date TEXT NOT NULL,
      client_name TEXT NOT NULL,
      embark_point TEXT NOT NULL,
      tons REAL NOT NULL,
      rne REAL,
      status TEXT
    )
  `,
  )

  await db.run(`CREATE INDEX IF NOT EXISTS idx_os_records_date ON os_records(date)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_os_records_client ON os_records(client_name)`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_os_records_point ON os_records(embark_point)`)

  await db.run(
    `
    CREATE TABLE IF NOT EXISTS billing_rules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      daily_fee_brl REAL NOT NULL,
      base_tariff_brl_per_ton REAL NOT NULL,
      min_cadence_tons REAL NOT NULL,
      excess_multiplier REAL NOT NULL
    )
  `,
  )

  await db.run(
    `
    INSERT INTO billing_rules (id, daily_fee_brl, base_tariff_brl_per_ton, min_cadence_tons, excess_multiplier)
    SELECT 1, 400, 2, 200, 2
    WHERE NOT EXISTS (SELECT 1 FROM billing_rules WHERE id = 1)
  `,
  )
}
