import crypto from 'crypto'
import type { Programacao, ProgramacaoItem } from '../types.js'
import { collectOsAtivas } from '../collector/osAtivasCollector.js'
import { collectManyOsDetalhes } from '../collector/osDetalheCollector.js'
import type { OsDetalhe } from '../collector/osDetalheCollector.js'
import { listClassificadores } from './classificadoresRepo.js'
import { listOsRecordsForExport } from './osRepo.js'
import { getSupabase } from '../supabase.js'

type ProgramacaoRow = {
  id: string
  data: string
  created_by_user_id: string | null
  created_by_name: string | null
  import_source_date: string | null
  import_reference: string | null
  created_at: string | null
  updated_at: string | null
}

type ProgramacaoItemRow = {
  id: string
  programacao_id: string
  classificador_id: string | null
  classificador_nome: string
  cliente: string | null
  local_embarque: string
  os_id: string
  destino: string | null
  fazenda_armazem: string | null
  volume_remanescente: number | null
  volume_embarcado: number | null
  volume_os: number | null
  produto: string | null
  created_at: string | null
  updated_at: string | null
}

const PROGRAMACAO_COLUMNS =
  'id,data,created_by_user_id,created_by_name,import_source_date,import_reference,created_at,updated_at'
const ITEM_COLUMNS =
  'id,programacao_id,classificador_id,classificador_nome,cliente,local_embarque,os_id,destino,fazenda_armazem,volume_remanescente,volume_embarcado,volume_os,produto,created_at,updated_at'

const fromProgramacaoRow = (r: ProgramacaoRow, itens: ProgramacaoItem[]): Programacao => ({
  id: r.id,
  data: r.data,
  itens,
  createdByUserId: r.created_by_user_id ?? null,
  responsavelNome: r.created_by_name ?? null,
  importSourceDate: r.import_source_date ?? null,
  importReference: r.import_reference ?? null,
  createdAt: r.created_at ?? null,
  updatedAt: r.updated_at ?? null,
})

const fromItemRow = (r: ProgramacaoItemRow): ProgramacaoItem => ({
  id: r.id,
  programacaoId: r.programacao_id,
  classificadorId: r.classificador_id ?? null,
  classificadorNome: r.classificador_nome,
  cliente: r.cliente ?? null,
  localEmbarque: r.local_embarque,
  osId: r.os_id,
  destino: r.destino ?? null,
  fazendaArmazem: r.fazenda_armazem ?? null,
  volumeRemanescente: r.volume_remanescente == null ? null : Number(r.volume_remanescente),
  volumeEmbarcado: r.volume_embarcado == null ? null : Number(r.volume_embarcado),
  volumeOs: r.volume_os == null ? null : Number(r.volume_os),
  produto: r.produto ?? null,
  createdAt: r.created_at ?? null,
  updatedAt: r.updated_at ?? null,
})

const toItemRow = (item: Omit<ProgramacaoItem, 'createdAt' | 'updatedAt'>): Omit<
  ProgramacaoItemRow,
  'created_at' | 'updated_at'
> => ({
  id: item.id,
  programacao_id: item.programacaoId,
  classificador_id: item.classificadorId,
  classificador_nome: item.classificadorNome,
  cliente: item.cliente,
  local_embarque: item.localEmbarque,
  os_id: item.osId,
  destino: item.destino,
  fazenda_armazem: item.fazendaArmazem,
  volume_remanescente: item.volumeRemanescente,
  volume_embarcado: item.volumeEmbarcado,
  volume_os: item.volumeOs,
  produto: item.produto,
})

const makeId = (): string => crypto.randomUUID()

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const bestClassifierName = (
  records: Array<{ classifierName?: string | null; tons: number }>,
): string => {
  const byName = new Map<string, { label: string; tons: number }>()
  for (const record of records) {
    const label = String(record.classifierName ?? '').trim()
    if (!label) continue
    const key = normalizeName(label)
    const current = byName.get(key)
    byName.set(key, {
      label: current?.label ?? label,
      tons: (current?.tons ?? 0) + Number(record.tons ?? 0),
    })
  }

  const [top] = [...byName.values()].sort((a, b) => b.tons - a.tons)
  return top?.label ?? 'Sem classificador'
}

const effectiveRemanescenteKg = (args: {
  loteKg: number | null | undefined
  embarcadosKg: number | null | undefined
  remanescenteKg: number | null | undefined
}): number | null => {
  const lote = Number(args.loteKg ?? 0)
  const embarcados = Number(args.embarcadosKg ?? 0)
  const remanescente = Number(args.remanescenteKg ?? 0)

  if (lote > 0 && embarcados <= 0 && remanescente <= 0) return lote
  if (args.remanescenteKg == null) return null
  return args.remanescenteKg
}

export const getProgramacaoById = async (id: string): Promise<Programacao | null> => {
  const sb = getSupabase()

  const { data: p, error: pErr } = await sb
    .from('programacoes')
    .select(PROGRAMACAO_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (pErr) throw new Error(pErr.message)
  if (!p) return null

  const { data: itensRows, error: iErr } = await sb
    .from('programacao_itens')
    .select(ITEM_COLUMNS)
    .eq('programacao_id', id)
    .order('created_at', { ascending: true })

  if (iErr) throw new Error(iErr.message)
  const itens = (itensRows ?? []).map((r) => fromItemRow(r as ProgramacaoItemRow))
  return fromProgramacaoRow(p as ProgramacaoRow, itens)
}

export const getProgramacaoByDate = async (data: string): Promise<Programacao | null> => {
  const sb = getSupabase()
  const { data: p, error } = await sb
    .from('programacoes')
    .select(PROGRAMACAO_COLUMNS)
    .eq('data', data)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!p) return null
  return getProgramacaoById((p as ProgramacaoRow).id)
}

export const listProgramacoes = async (args?: {
  from?: string
  to?: string
  page?: number
  pageSize?: number
}): Promise<{
  items: Array<
    Pick<
      Programacao,
      'id' | 'data' | 'importSourceDate' | 'importReference' | 'createdAt' | 'updatedAt'
    >
  >
  total: number
}> => {
  const sb = getSupabase()
  const page = args?.page && args.page > 0 ? args.page : 1
  const pageSize = args?.pageSize && args.pageSize > 0 ? Math.min(args.pageSize, 200) : 25
  const offset = (page - 1) * pageSize
  const toIndex = offset + pageSize - 1

  let q = sb.from('programacoes').select(PROGRAMACAO_COLUMNS, { count: 'exact' })
  if (args?.from) q = q.gte('data', args.from)
  if (args?.to) q = q.lte('data', args.to)

  const { data, count, error } = await q
    .order('data', { ascending: false })
    .range(offset, toIndex)

  if (error) throw new Error(error.message)

  const items = (data ?? []).map((r) => {
    const row = r as ProgramacaoRow
    return {
      id: row.id,
      data: row.data,
      importSourceDate: row.import_source_date ?? null,
      importReference: row.import_reference ?? null,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null,
    }
  })

  return { items, total: count ?? 0 }
}

export const saveProgramacao = async (args: {
  id?: string
  data: string
  responsavel?: { userId: string | null; nome: string | null }
  importSourceDate?: string | null
  importReference?: string | null
  itens: Array<
    Omit<ProgramacaoItem, 'id' | 'programacaoId' | 'createdAt' | 'updatedAt'> & { id?: string }
  >
}): Promise<Programacao> => {
  const sb = getSupabase()
  const id = args.id ?? makeId()

  const programacaoRow: Record<string, string | null> = {
    id,
    data: args.data,
    created_by_user_id: args.responsavel?.userId ?? null,
    created_by_name: args.responsavel?.nome ?? null,
    updated_at: new Date().toISOString(),
  }
  if ('importSourceDate' in args) programacaoRow.import_source_date = args.importSourceDate ?? null
  if ('importReference' in args) programacaoRow.import_reference = args.importReference ?? null

  const { error: upErr } = await sb.from('programacoes').upsert(programacaoRow, { onConflict: 'id' })
  if (upErr) throw new Error(upErr.message)

  const { error: delErr } = await sb.from('programacao_itens').delete().eq('programacao_id', id)
  if (delErr) throw new Error(delErr.message)

  const itensRows = args.itens.map((i) =>
    toItemRow({
      id: i.id ?? makeId(),
      programacaoId: id,
      classificadorId: i.classificadorId ?? null,
      classificadorNome: i.classificadorNome,
      cliente: i.cliente ?? null,
      localEmbarque: i.localEmbarque,
      osId: i.osId,
      destino: i.destino ?? null,
      fazendaArmazem: i.fazendaArmazem ?? null,
      volumeRemanescente: i.volumeRemanescente ?? null,
      volumeEmbarcado: i.volumeEmbarcado ?? null,
      volumeOs: i.volumeOs ?? null,
      produto: i.produto ?? null,
    }),
  )

  if (itensRows.length) {
    const { error: insErr } = await sb.from('programacao_itens').insert(itensRows)
    if (insErr) throw new Error(insErr.message)
  }

  const saved = await getProgramacaoById(id)
  if (!saved) throw new Error('Programação não retornada')
  return saved
}

export const importProgramacaoFromMovements = async (args: {
  sourceDate: string
  targetDate: string
  responsavel?: { userId: string | null; nome: string | null }
}): Promise<{ programacao: Programacao; importedCount: number }> => {
  const records = await listOsRecordsForExport({
    from: args.sourceDate,
    to: args.sourceDate,
  })
  const importableRecords = records.filter((record) => {
    const id = String(record.id ?? '')
    if (id.startsWith('OSDAY-')) return false
    const isLoad = Number(record.tons ?? 0) > 0
    const isRne =
      Number(record.rne ?? 0) === 1 ||
      String(record.status ?? '').trim().toLowerCase() === 'rne' ||
      id.startsWith('RNE-')
    return isLoad || isRne
  })

  const grouped = new Map<string, typeof records>()
  for (const record of importableRecords) {
    const osId = String(record.osId ?? record.id ?? '').trim()
    if (!osId) continue
    const client = String(record.clientName ?? '').trim()
    const point = String(record.embarkPoint ?? '').trim()
    const key = [osId, client, point].map((v) => normalizeName(v)).join('|')
    const current = grouped.get(key) ?? []
    current.push(record)
    grouped.set(key, current)
  }

  const classificadores = await listClassificadores({ onlyActive: true })
  const classificadorByName = new Map(
    classificadores.map((item) => [normalizeName(item.nome), item]),
  )
  const osAtivas = await collectOsAtivas()
  const osAtivaById = new Map(osAtivas.map((item) => [normalizeName(item.osId), item]))

  const shouldLoadDetail = (osId: string): boolean => {
    const osAtiva = osAtivaById.get(normalizeName(osId))
    if (!osAtiva?.detailId?.trim()) return false
    return (
      !String(osAtiva.clientName ?? '').trim() ||
      !String(osAtiva.embarkPoint ?? '').trim() ||
      !String(osAtiva.produto ?? '').trim() ||
      !String(osAtiva.destino ?? '').trim() ||
      osAtiva.loteKg == null ||
      osAtiva.embarcadosKg == null ||
      osAtiva.remanescenteKg == null
    )
  }

  const detailIds = [...grouped.values()]
    .map((group) => String(group[0]?.osId ?? group[0]?.id ?? '').trim())
    .filter((osId) => osId && shouldLoadDetail(osId))
    .map((osId) => osAtivaById.get(normalizeName(osId))?.detailId?.trim() ?? '')
    .filter(Boolean)
  const detalheById = await collectManyOsDetalhes(detailIds).catch(
    () => new Map<string, OsDetalhe | null>(),
  )

  const importedItens: Array<
    Omit<ProgramacaoItem, 'id' | 'programacaoId' | 'createdAt' | 'updatedAt'>
  > = []

  for (const group of grouped.values()) {
      const first = group[0]
      const osId = String(first.osId ?? first.id ?? '').trim()
      const cliente = String(first.clientName ?? '').trim() || null
      const localEmbarque = String(first.embarkPoint ?? '').trim()
      const classificadorNome = bestClassifierName(group)
      const classificador = classificadorByName.get(normalizeName(classificadorNome))
      const osAtiva = osAtivaById.get(normalizeName(osId)) ?? null
      const detailId = osAtiva?.detailId?.trim() ?? ''
      const detalhe = detailId ? detalheById.get(detailId) ?? null : null

      const clientName = detalhe?.clientName ?? osAtiva?.clientName ?? cliente
      const embarkPoint = detalhe?.embarque ?? osAtiva?.embarkPoint ?? localEmbarque
      const loteKg = detalhe?.loteKg ?? osAtiva?.loteKg ?? null
      const embarcadosKg = detalhe?.embarcadosKg ?? osAtiva?.embarcadosKg ?? null
      const remanescenteKg = effectiveRemanescenteKg({
        loteKg,
        embarcadosKg,
        remanescenteKg: detalhe?.remanescenteKg ?? osAtiva?.remanescenteKg ?? null,
      })

      importedItens.push({
        classificadorId: classificador?.id ?? null,
        classificadorNome: classificador?.nome ?? classificadorNome,
        cliente: clientName,
        localEmbarque: embarkPoint ?? '',
        osId,
        destino: detalhe?.destino ?? osAtiva?.destino ?? null,
        fazendaArmazem: embarkPoint ?? null,
        volumeRemanescente: remanescenteKg,
        volumeEmbarcado: embarcadosKg,
        volumeOs: loteKg,
        produto: detalhe?.produto ?? osAtiva?.produto ?? 'Soja',
      })
  }

  const itens = importedItens
    .filter((item) => item.osId && item.localEmbarque)
    .sort((a, b) => a.localEmbarque.localeCompare(b.localEmbarque, 'pt-BR'))

  const existing = await getProgramacaoByDate(args.targetDate)
  const importReference = `IMPORT-${args.sourceDate.replace(/-/g, '')}`
  const programacao = await saveProgramacao({
    id: existing?.id,
    data: args.targetDate,
    responsavel: args.responsavel,
    importSourceDate: args.sourceDate,
    importReference,
    itens,
  })

  return { programacao, importedCount: itens.length }
}

export const deleteProgramacao = async (id: string): Promise<void> => {
  const sb = getSupabase()
  const { error } = await sb.from('programacoes').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
