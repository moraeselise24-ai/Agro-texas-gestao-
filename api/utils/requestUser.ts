import type { Request } from 'express'
import { getSupabase } from '../supabase.js'

export type RequestUser = {
  id: string
  fullName: string | null
  email: string | null
}

export const getRequestUser = async (req: Request): Promise<RequestUser | null> => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length).trim()
  if (!token) return null

  const sb = getSupabase()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return null

  const { data: profile } = await sb
    .from('profiles')
    .select('full_name,email')
    .eq('id', data.user.id)
    .maybeSingle()

  const metaName = data.user.user_metadata?.full_name
  const fullNameFromMeta = typeof metaName === 'string' && metaName.trim() ? metaName.trim() : null

  return {
    id: data.user.id,
    fullName: (profile?.full_name?.trim() || fullNameFromMeta) ?? null,
    email: profile?.email ?? data.user.email ?? null,
  }
}

export const formatResponsavelNome = (user: RequestUser | null): string | null => {
  if (!user) return null
  if (user.fullName?.trim()) return user.fullName.trim()
  if (user.email?.trim()) return user.email.trim()
  return null
}
