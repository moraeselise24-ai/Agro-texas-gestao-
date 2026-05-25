import type { OsRecord } from '../types.js'
import { filterMovementRecords } from '../services/movement.js'
import { getSupabase } from '../supabase.js'

type OsRow = {
  id: string
  os_id: string | null
  date: string
  client_name: string
  embark_point: string
  tons: number
  rne: number | null
  status: string | null
}

const MOVEMENT_OR_FILTER = 'tons.gt.0,rne.eq.1,status.eq.RNE'

const RECORD_COLUMNS = 'id,os_id,date,client_name,embark_point,tons,rne,status'

export type OsRecordTypeFilter = 'all' | 'loads' | 'rne'

const toRow = (r: OsRecord): OsRow => ({
  id: r.id,
  os_id: r.osId?.trim() ? r.osId.trim() : null,
  date: r.date,
  client_name: r.clientName,
  embark_point: r.embarkPoint,
  tons: r.tons,
  rne: r.rne,
  status: r.status,
})

const fromRow = (r: OsRow): OsRecord => ({
  id: r.id,
  osId: r.os_id ?? null,
  date: r.date,
  clientName: r.client_name,
  embarkPoint: r.embark_point,
  tons: Number(r.tons ?? 0),
  rne: r.rne == null ? null : Number(r.rne),
  status: r.status ?? null,
})

export const dedupeOsRecordsById = (
  records: OsRecord[],
): { items: OsRecord[]; duplicatesDropped: number } => {
  const byId = new Map<string, OsRecord>()
  for (const record of records) {
    byId.set(record.id, record)
  }
  const items = [...byId.values()]
  return { items, duplicatesDropped: records.length - items.length }
}

export const upsertOsRecords = async (records: OsRecord[]): Promise<void> => {
  if (!records.length) return
  const { items } = dedupeOsRecordsById(records)
  if (!items.length) return
  const sb = getSupabase()
  const { error } = await sb.from('os_records').upsert(items.map(toRow), { onConflict: 'id' })
  if (error) throw new Error(error.message)
}

export const listOsRecords = async (args: {
  from: string
  to: string
  q?: string
  client?: string
  point?: string
  type?: OsRecordTypeFilter
  page: number
  pageSize: number
}): Promise<{ items: OsRecord[]; total: number }> => {
  const sb = getSupabase()
  const offset = (args.page - 1) * args.pageSize
  const toIndex = offset + args.pageSize - 1

  let query = sb
    .from('os_records')
    .select(RECORD_COLUMNS, { count: 'exact' })
    .gte('date', args.from)
    .lte('date', args.to)
    .or(MOVEMENT_OR_FILTER)

  query = applyOsRecordFilters(query, args)

  const { data, count, error } = await query
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, toIndex)

  if (error) throw new Error(error.message)

  return {
    items: (data ?? []).map(fromRow),
    total: count ?? 0,
  }
}

type FilterableQuery<T> = {
  eq: (column: string, value: string) => T
  or: (filter: string) => T
  gt: (column: string, value: number) => T
  not: (column: string, operator: string, value: string) => T
}

const applyOsRecordFilters = <T extends FilterableQuery<T>>(
  query: T,
  args: {
    q?: string
    client?: string
    point?: string
    type?: OsRecordTypeFilter
  },
): T => {
  let q = query
  if (args.client) q = q.eq('client_name', args.client)
  if (args.point) q = q.eq('embark_point', args.point)
  if (args.type === 'rne') {
    q = q.or('rne.eq.1,status.eq.RNE,id.ilike.RNE-%')
  } else if (args.type === 'loads') {
    q = q.gt('tons', 0).not('id', 'ilike', 'OSDAY-%')
  }
  if (args.q) {
    const like = `%${args.q}%`
    q = q.or(`id.ilike.${like},os_id.ilike.${like},client_name.ilike.${like},embark_point.ilike.${like}`)
  }
  return q
}

export const listOsRecordsForExport = async (args: {
  from: string
  to: string
  q?: string
  client?: string
  point?: string
  type?: OsRecordTypeFilter
}): Promise<OsRecord[]> => {
  const sb = getSupabase()

  let query = sb
    .from('os_records')
    .select(RECORD_COLUMNS)
    .gte('date', args.from)
    .lte('date', args.to)
    .or(MOVEMENT_OR_FILTER)

  query = applyOsRecordFilters(query, args)

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map(fromRow)
}

export const listOsRecordsInRange = async (from: string, to: string): Promise<OsRecord[]> => {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('os_records')
    .select(RECORD_COLUMNS)
    .gte('date', from)
    .lte('date', to)
    .or(MOVEMENT_OR_FILTER)

  if (error) throw new Error(error.message)

  return filterMovementRecords((data ?? []).map(fromRow))
}
