import type { Classificador } from '../types.js'
import { getSupabase } from '../supabase.js'

type ClassificadorRow = {
  id: string
  nome: string
  email: string | null
  whatsapp: string | null
  municipio: string | null
  uf: string | null
  status: string | null
  ativo: boolean | null
  created_at: string | null
  updated_at: string | null
}

const COLUMNS =
  'id,nome,email,whatsapp,municipio,uf,status,ativo,created_at,updated_at'

const toRow = (c: Classificador): Omit<ClassificadorRow, 'created_at' | 'updated_at'> => ({
  id: c.id,
  nome: c.nome,
  email: c.email,
  whatsapp: c.whatsapp,
  municipio: c.municipio,
  uf: c.uf,
  status: c.status,
  ativo: c.ativo,
})

const fromRow = (r: ClassificadorRow): Classificador => ({
  id: r.id,
  nome: r.nome,
  email: r.email ?? null,
  whatsapp: r.whatsapp ?? null,
  municipio: r.municipio ?? null,
  uf: r.uf ?? null,
  status: r.status ?? null,
  ativo: Boolean(r.ativo),
})

export const upsertClassificadores = async (items: Classificador[]): Promise<void> => {
  if (!items.length) return
  const sb = getSupabase()
  const { error } = await sb
    .from('classificadores')
    .upsert(items.map(toRow), { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export const listClassificadores = async (args?: {
  onlyActive?: boolean
}): Promise<Classificador[]> => {
  const sb = getSupabase()
  let q = sb.from('classificadores').select(COLUMNS)
  if (args?.onlyActive) q = q.eq('ativo', true)
  const { data, error } = await q.order('nome', { ascending: true }).range(0, 9999)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => fromRow(r as ClassificadorRow))
}

