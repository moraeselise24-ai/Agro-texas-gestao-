import type { OsRecord, WorkedDayClassifierSummary, WorkedDaysTotals } from '../types.js'
import { filterMovementRecords } from '../services/movement.js'
import { OS_DAY_VOLUME_ID_PREFIX } from '../services/volume.js'
import { getSupabase } from '../supabase.js'

type OsRow = {
  id: string
  os_id: string | null
  date: string
  client_name: string
  embark_point: string
  classifier_name: string | null
  plate: string | null
  tons: number
  rne: number | null
  status: string | null
}

const MOVEMENT_OR_FILTER = 'tons.gt.0,rne.eq.1,status.eq.RNE'

const RECORD_COLUMNS = 'id,os_id,date,client_name,embark_point,classifier_name,plate,tons,rne,status'

export type OsRecordTypeFilter = 'all' | 'loads' | 'rne'

const toRow = (r: OsRecord): OsRow => ({
  id: r.id,
  os_id: r.osId?.trim() ? r.osId.trim() : null,
  date: r.date,
  client_name: r.clientName,
  embark_point: r.embarkPoint,
  classifier_name: r.classifierName?.trim() ? r.classifierName.trim() : null,
  plate: r.plate?.trim() ? r.plate.trim() : null,
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
  classifierName: r.classifier_name ?? null,
  plate: r.plate ?? null,
  tons: Number(r.tons ?? 0),
  rne: r.rne == null ? null : Number(r.rne),
  status: r.status ?? null,
})

const normalizeClientName = (value: string | null | undefined): string =>
  String(value ?? '').replace(/\s+/g, ' ').trim()

const stripClientLocation = (value: string): string =>
  normalizeClientName(value).replace(/,\s*[^,]+?\s+-\s*[A-Z]{2}$/i, '').trim()

const isLtdaClientName = (value: string | null | undefined): boolean =>
  /\bLTDA\.?$/i.test(stripClientLocation(String(value ?? '')))

const clientIdentityKey = (value: string | null | undefined): string =>
  stripClientLocation(String(value ?? ''))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+-\s*FILIAL\b.*$/i, '')
    .replace(/\b(LTDA|EIRELI|S\/A|SA|ME|EPP)\b\.?/gi, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

let canonicalClientsCache: { expiresAt: number; names: string[] } | null = null

const listCanonicalClientNames = async (): Promise<string[]> => {
  const now = Date.now()
  if (canonicalClientsCache && canonicalClientsCache.expiresAt > now) {
    return canonicalClientsCache.names
  }

  const { data, error } = await getSupabase()
    .from('operation_service_order_options')
    .select('name')
    .eq('type', 'client')
    .eq('active', true)
    .range(0, 9999)

  if (error) {
    if (/operation_service_order_options/i.test(error.message)) return []
    throw new Error(error.message)
  }

  const names = [
    ...new Set(
      (data ?? [])
        .map((row) => stripClientLocation(String((row as { name?: unknown }).name ?? '')))
        .filter((name) => name && isLtdaClientName(name)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'pt-BR'))

  canonicalClientsCache = { expiresAt: now + 60_000, names }
  return names
}

const canonicalizeClientName = (value: string | null | undefined, canonicalClients: string[]): string => {
  const clean = normalizeClientName(value)
  if (!clean) return ''

  const cleanWithoutLocation = stripClientLocation(clean)
  const key = clientIdentityKey(cleanWithoutLocation)
  const match = canonicalClients.find((client) => clientIdentityKey(client) === key)
  if (match) return match

  return isLtdaClientName(cleanWithoutLocation) ? cleanWithoutLocation : clean
}

const canonicalizeRecordClients = (records: OsRecord[], canonicalClients: string[]): OsRecord[] =>
  records.map((record) => ({
    ...record,
    clientName: canonicalizeClientName(record.clientName, canonicalClients),
  }))

const filterRecordsByCanonicalClient = (
  records: OsRecord[],
  clientName: string | null | undefined,
  canonicalClients: string[],
): OsRecord[] => {
  const selected = canonicalizeClientName(clientName, canonicalClients)
  const selectedKey = clientIdentityKey(selected)
  if (!selectedKey) return records
  return records.filter((record) => clientIdentityKey(record.clientName) === selectedKey)
}

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

export const deleteStaleLoadRecords = async (args: {
  dates: string[]
  currentLoadIds: string[]
}): Promise<number> => {
  const dates = [...new Set(args.dates.filter(Boolean))]
  if (!dates.length) return 0

  const sb = getSupabase()
  const { data, error } = await sb
    .from('os_records')
    .select('id')
    .in('date', dates)
    .gt('tons', 0)
    .is('rne', null)
    .not('id', 'ilike', `${OS_DAY_VOLUME_ID_PREFIX}%`)
    .not('id', 'ilike', 'RNE-%')

  if (error) throw new Error(error.message)

  const currentIds = new Set(args.currentLoadIds)
  const staleIds = (data ?? [])
    .map((row) => String(row.id ?? ''))
    .filter((id) => id && !currentIds.has(id))

  if (!staleIds.length) return 0

  const { error: deleteError } = await sb.from('os_records').delete().in('id', staleIds)
  if (deleteError) throw new Error(deleteError.message)

  return staleIds.length
}

export const deleteStaleRneRecords = async (args: {
  dates: string[]
  currentRneIds: string[]
}): Promise<number> => {
  const dates = [...new Set(args.dates.filter(Boolean))]
  if (!dates.length) return 0

  const sb = getSupabase()
  const { data, error } = await sb
    .from('os_records')
    .select('id')
    .in('date', dates)
    .or('rne.eq.1,status.eq.RNE,id.ilike.RNE-%')

  if (error) throw new Error(error.message)

  const currentIds = new Set(args.currentRneIds)
  const staleIds = (data ?? [])
    .map((row) => String(row.id ?? ''))
    .filter((id) => id && !currentIds.has(id))

  if (!staleIds.length) return 0

  const { error: deleteError } = await sb.from('os_records').delete().in('id', staleIds)
  if (deleteError) throw new Error(deleteError.message)

  return staleIds.length
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
  const canonicalClients = await listCanonicalClientNames()

  let query = sb
    .from('os_records')
    .select(RECORD_COLUMNS, { count: 'exact' })
    .gte('date', args.from)
    .lte('date', args.to)
    .or(MOVEMENT_OR_FILTER)

  query = applyOsRecordFilters(query, { ...args, client: undefined })

  const needsClientFilter = Boolean(args.client)
  const { data, count, error } = await query
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(needsClientFilter ? 0 : offset, needsClientFilter ? 9999 : toIndex)

  if (error) throw new Error(error.message)

  const records = canonicalizeRecordClients((data ?? []).map(fromRow), canonicalClients)
  if (needsClientFilter) {
    const filtered = filterRecordsByCanonicalClient(records, args.client, canonicalClients)
    return {
      items: filtered.slice(offset, offset + args.pageSize),
      total: filtered.length,
    }
  }

  return {
    items: records,
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
    q = q.or(`id.ilike.${like},os_id.ilike.${like},client_name.ilike.${like},embark_point.ilike.${like},plate.ilike.${like}`)
  }
  return q
}

export const listPlateOccurrences = async (args: {
  from: string
  to: string
  plate?: string
  q?: string
  page: number
  pageSize: number
}): Promise<{
  items: OsRecord[]
  total: number
  summary: {
    plates: number
    occurrences: number
    osCount: number
    tons: number
    rneCount: number
  }
}> => {
  const all = await listOsRecordsForExport({
    from: args.from,
    to: args.to,
    type: 'all',
  })

  const normalizePlateSearch = (value: string): string => String(value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const plateFilter = normalizePlateSearch(args.plate ?? '')
  const search = String(args.q ?? '').trim().toLowerCase()
  const filtered = all.filter((record) => {
    const plate = String(record.plate ?? '').trim()
    if (!plate) return false
    const plateKey = normalizePlateSearch(plate)
    const haystack = [
      plate,
      record.osId,
      record.id,
      record.clientName,
      record.embarkPoint,
      record.classifierName,
      record.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (plateFilter && plateKey !== plateFilter) return false
    if (search && !haystack.includes(search)) return false
    return true
  })

  const offset = (args.page - 1) * args.pageSize
  const items = filtered.slice(offset, offset + args.pageSize)

  return {
    items,
    total: filtered.length,
    summary: {
      plates: new Set(filtered.map((record) => String(record.plate ?? '').trim()).filter(Boolean)).size,
      occurrences: filtered.length,
      osCount: new Set(filtered.map((record) => record.osId ?? record.id).filter(Boolean)).size,
      tons: filtered.reduce((sum, record) => sum + (Number(record.tons ?? 0) || 0), 0),
      rneCount: filtered.reduce((sum, record) => sum + (Number(record.rne ?? 0) || 0), 0),
    },
  }
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
  const canonicalClients = await listCanonicalClientNames()

  let query = sb
    .from('os_records')
    .select(RECORD_COLUMNS)
    .gte('date', args.from)
    .lte('date', args.to)
    .or(MOVEMENT_OR_FILTER)

  query = applyOsRecordFilters(query, { ...args, client: undefined })

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw new Error(error.message)

  const records = canonicalizeRecordClients((data ?? []).map(fromRow), canonicalClients)
  return args.client ? filterRecordsByCanonicalClient(records, args.client, canonicalClients) : records
}

export const listOsRecordsByOsId = async (args: {
  osId: string
  from?: string
  to?: string
}): Promise<OsRecord[]> => {
  const sb = getSupabase()

  let query = sb
    .from('os_records')
    .select(RECORD_COLUMNS)
    .eq('os_id', args.osId)
    .or(MOVEMENT_OR_FILTER)

  if (args.from) query = query.gte('date', args.from)
  if (args.to) query = query.lte('date', args.to)

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

const isRneLikeRecord = (record: OsRecord): boolean =>
  record.id.startsWith('RNE-') || record.status === 'RNE' || Number(record.rne ?? 0) === 1

export const listWorkedDaysByClassifier = async (args: {
  from: string
  to: string
  q?: string
}): Promise<{
  items: WorkedDayClassifierSummary[]
  totals: WorkedDaysTotals
}> => {
  const records = await listOsRecordsForExport({
    from: args.from,
    to: args.to,
    type: 'all',
  })
  const search = String(args.q ?? '').trim().toLowerCase()
  const byClassifier = new Map<
    string,
    {
      volumeDates: Set<string>
      rneDates: Set<string>
      osKeys: Set<string>
      dates: Map<
        string,
        {
          tons: number
          rneCount: number
          osKeys: Set<string>
          serviceOrders: Map<string, { osId: string; farmName: string; tons: number; rneCount: number }>
        }
      >
      tons: number
      rneCount: number
    }
  >()

  for (const record of records) {
    const classifierName = String(record.classifierName ?? '').trim()
    if (!classifierName) continue
    if (search && !classifierName.toLowerCase().includes(search)) continue

    const rne = isRneLikeRecord(record)
    const tons = Number(record.tons ?? 0)
    const hasVolume = !rne && tons > 0
    if (!hasVolume && !rne) continue

    const current =
      byClassifier.get(classifierName) ??
      {
        volumeDates: new Set<string>(),
        rneDates: new Set<string>(),
        osKeys: new Set<string>(),
        dates: new Map<
          string,
          {
            tons: number
            rneCount: number
            osKeys: Set<string>
            serviceOrders: Map<string, { osId: string; farmName: string; tons: number; rneCount: number }>
          }
        >(),
        tons: 0,
        rneCount: 0,
      }
    const dateSummary =
      current.dates.get(record.date) ?? {
        tons: 0,
        rneCount: 0,
        osKeys: new Set<string>(),
        serviceOrders: new Map<string, { osId: string; farmName: string; tons: number; rneCount: number }>(),
      }
    const osKey = String(record.osId ?? record.id).trim()
    const serviceOrder =
      dateSummary.serviceOrders.get(osKey) ?? {
        osId: osKey,
        farmName: String(record.embarkPoint ?? '').trim() || 'Fazenda não informada',
        tons: 0,
        rneCount: 0,
      }

    if (hasVolume) {
      current.volumeDates.add(record.date)
      current.tons += tons
      dateSummary.tons += tons
      serviceOrder.tons += tons
    }
    if (rne) {
      current.rneDates.add(record.date)
      current.rneCount += 1
      dateSummary.rneCount += 1
      serviceOrder.rneCount += 1
    }
    if (osKey) {
      current.osKeys.add(osKey)
      dateSummary.osKeys.add(osKey)
      dateSummary.serviceOrders.set(osKey, serviceOrder)
    }
    current.dates.set(record.date, dateSummary)
    byClassifier.set(classifierName, current)
  }

  const items = [...byClassifier.entries()]
    .map(([classifierName, summary]) => {
      const days = new Set([...summary.volumeDates, ...summary.rneDates])
      return {
        classifierName,
        daysWorked: days.size,
        volumeDays: summary.volumeDates.size,
        rneDays: summary.rneDates.size,
        tons: summary.tons,
        rneCount: summary.rneCount,
        osCount: summary.osKeys.size,
        dates: [...summary.dates.entries()]
          .map(([date, item]) => ({
            date,
            tons: item.tons,
            rneCount: item.rneCount,
            osCount: item.osKeys.size,
            osIds: [...item.osKeys].sort((a, b) => a.localeCompare(b, 'pt-BR')),
            serviceOrders: [...item.serviceOrders.values()].sort((a, b) =>
              a.osId.localeCompare(b.osId, 'pt-BR'),
            ),
          }))
          .sort((a, b) => b.date.localeCompare(a.date)),
      }
    })
    .sort((a, b) => b.daysWorked - a.daysWorked || b.tons - a.tons || a.classifierName.localeCompare(b.classifierName, 'pt-BR'))

  const allDays = new Set<string>()
  for (const item of items) {
    for (const date of item.dates) {
      allDays.add(date.date)
    }
  }

  return {
    items,
    totals: {
      classifiers: items.length,
      daysWorked: allDays.size,
      totalClassifierDays: items.reduce((sum, item) => sum + item.daysWorked, 0),
      tons: items.reduce((sum, item) => sum + item.tons, 0),
      rneCount: items.reduce((sum, item) => sum + item.rneCount, 0),
      osCount: items.reduce((sum, item) => sum + item.osCount, 0),
    },
  }
}

export const listClientNames = async (args: {
  from: string
  to: string
  q?: string
  point?: string
  type?: OsRecordTypeFilter
}): Promise<string[]> => {
  const sb = getSupabase()
  const canonicalClients = await listCanonicalClientNames()

  let query = sb
    .from('os_records')
    .select('client_name')
    .gte('date', args.from)
    .lte('date', args.to)
    .or(MOVEMENT_OR_FILTER)

  query = applyOsRecordFilters(query, { q: args.q, point: args.point, type: args.type })

  const { data, error } = await query.order('client_name', { ascending: true }).range(0, 9999)

  if (error) throw new Error(error.message)

  const set = new Set<string>()
  for (const row of data ?? []) {
    const name = String((row as { client_name?: unknown }).client_name ?? '').trim()
    if (!name) continue
    const canonical = canonicalizeClientName(name, canonicalClients)
    if (isLtdaClientName(canonical)) set.add(canonical)
  }

  return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
