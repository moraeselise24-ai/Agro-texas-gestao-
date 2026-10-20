import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import WebSocket from 'ws'

dotenv.config()

let client: SupabaseClient | null = null

const normalizeSupabaseUrl = (raw: string): string => {
  let url = raw.trim()
  url = url.replace(/\/rest\/v1\/?$/i, '')
  url = url.replace(/\/+$/, '')
  return url
}

export const getSupabase = (): SupabaseClient => {
  if (client) return client

  const urlRaw = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

  if (!urlRaw || !key) {
    throw new Error('Supabase not configured')
  }

  const url = normalizeSupabaseUrl(urlRaw)

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  })

  return client
}
