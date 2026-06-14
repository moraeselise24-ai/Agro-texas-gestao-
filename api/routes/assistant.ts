import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { getBillingRules } from '../repositories/configRepo.js'
import { listExpenses } from '../repositories/expensesRepo.js'
import { listOsRecordsForExport, listWorkedDaysByClassifier } from '../repositories/osRepo.js'
import { listProgramacoes } from '../repositories/programacoesRepo.js'
import { listRevenues } from '../repositories/revenuesRepo.js'
import { buildStats } from '../services/stats.js'
import { getSupabase } from '../supabase.js'
import { formatResponsavelNome, getRequestUser } from '../utils/requestUser.js'
import { todayInTimeZone } from '../utils/todayInTz.js'
import type { Expense, Revenue, StatsResponse, WorkedDayClassifierSummary, WorkedDaysTotals } from '../types.js'

const router = Router()

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type ConversationRow = {
  id: string
  user_id: string | null
  title: string
  range_from: string | null
  range_to: string | null
  ai_enabled: boolean | null
  created_at: string | null
  updated_at: string | null
}

type MessageRow = {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string | null
}

type AssistantContext = {
  range: { from: string; to: string }
  stats: StatsResponse
  finance: {
    expenses: {
      total: number
      open: number
      paid: number
      scheduled: number
      upcoming: Array<Pick<Expense, 'date' | 'dueDate' | 'category' | 'description' | 'amountBRL' | 'status'>>
    }
    revenues: {
      total: number
      receivable: number
      received: number
      forecast: number
      upcoming: Array<Pick<Revenue, 'date' | 'dueDate' | 'expectedReceiptDate' | 'clientName' | 'description' | 'amountBRL' | 'status'>>
    }
    resultEstimated: number
    resultPosted: number
  }
  programacoes: {
    total: number
    latest: Array<{ id: string; data: string; createdAt: string | null; updatedAt: string | null }>
  }
  workedDays: {
    totals: WorkedDaysTotals
    classifiers: Array<
      Pick<
        WorkedDayClassifierSummary,
        'classifierName' | 'daysWorked' | 'volumeDays' | 'rneDays' | 'tons' | 'rneCount' | 'osCount'
      > & {
        dates: Array<{
          date: string
          tons: number
          rneCount: number
          osCount: number
          osIds: string[]
          serviceOrders: Array<{ osId: string; farmName: string; tons: number; rneCount: number }>
        }>
      }
    >
  }
  highlights: string[]
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num = new Intl.NumberFormat('pt-BR')
const tons = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const cleanDate = (value: unknown): string | null => {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

const stripAccents = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const toIso = (date: Date): string => date.toISOString().slice(0, 10)

const fromIsoNoon = (iso: string): Date => new Date(`${iso}T12:00:00.000Z`)

const addDays = (iso: string, days: number): string => {
  const date = fromIsoNoon(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIso(date)
}

const monthRange = (year: number, month1Based: number): { from: string; to: string } => {
  const from = toIso(new Date(Date.UTC(year, month1Based - 1, 1, 12)))
  const to = toIso(new Date(Date.UTC(year, month1Based, 0, 12)))
  return { from, to }
}

const parseBrDate = (dayRaw: string, monthRaw: string, yearRaw: string | undefined, today: string): string | null => {
  const day = Number(dayRaw)
  const month = Number(monthRaw)
  const currentYear = Number(today.slice(0, 4))
  const year = yearRaw ? Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw) : currentYear
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = fromIsoNoon(iso)
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day ? iso : null
}

const monthNames = new Map<string, number>([
  ['janeiro', 1],
  ['fevereiro', 2],
  ['marco', 3],
  ['abril', 4],
  ['maio', 5],
  ['junho', 6],
  ['julho', 7],
  ['agosto', 8],
  ['setembro', 9],
  ['outubro', 10],
  ['novembro', 11],
  ['dezembro', 12],
])

const inferRangeFromQuestion = (
  question: string,
  today: string,
): { from: string; to: string; reason: string } | null => {
  const q = stripAccents(question).replace(/\s+/g, ' ').trim()
  const current = fromIsoNoon(today)
  const currentYear = current.getUTCFullYear()
  const currentMonth = current.getUTCMonth() + 1

  const explicitIso = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/)
  if (explicitIso?.[1]) return { from: explicitIso[1], to: explicitIso[1], reason: 'data citada na pergunta' }

  const brDate = q.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (brDate) {
    const iso = parseBrDate(brDate[1], brDate[2], brDate[3], today)
    if (iso) return { from: iso, to: iso, reason: 'data citada na pergunta' }
  }

  const dayMonth = q.match(/\b(?:dia\s*)?(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(20\d{2}))?\b/)
  if (dayMonth) {
    const month = monthNames.get(dayMonth[2])
    const iso = month ? parseBrDate(dayMonth[1], String(month), dayMonth[3], today) : null
    if (iso) return { from: iso, to: iso, reason: 'data citada na pergunta' }
  }

  if (/\bontem\b/.test(q)) {
    const date = addDays(today, -1)
    return { from: date, to: date, reason: 'ontem citado na pergunta' }
  }
  if (/\bhoje\b/.test(q)) return { from: today, to: today, reason: 'hoje citado na pergunta' }
  if (/\banteontem\b|\bantes de ontem\b/.test(q)) {
    const date = addDays(today, -2)
    return { from: date, to: date, reason: 'anteontem citado na pergunta' }
  }

  const lastDays = q.match(/\b(?:ultimos?|ultimas?)\s+(\d{1,3})\s+dias\b/)
  if (lastDays) {
    const n = Math.max(1, Math.min(365, Number(lastDays[1])))
    return { from: addDays(today, -(n - 1)), to: today, reason: `${n} dias citados na pergunta` }
  }

  if (/\bsemana passada\b/.test(q)) {
    const date = fromIsoNoon(today)
    const day = date.getUTCDay() || 7
    const lastSunday = addDays(today, -day)
    return { from: addDays(lastSunday, -6), to: lastSunday, reason: 'semana passada citada na pergunta' }
  }

  if (/\bmes passado\b/.test(q)) {
    const monthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1, 12))
    return { ...monthRange(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1), reason: 'mês passado citado na pergunta' }
  }

  for (const [name, month] of monthNames) {
    const rx = new RegExp(`\\b${name}\\b`)
    if (!rx.test(q)) continue
    const yearMatch = q.match(new RegExp(`\\b${name}\\s+(?:de\\s+)?(20\\d{2})\\b`))
    const year = yearMatch?.[1] ? Number(yearMatch[1]) : month > currentMonth ? currentYear - 1 : currentYear
    return { ...monthRange(year, month), reason: `mês ${name} citado na pergunta` }
  }

  return null
}

const sum = <T>(items: T[], getValue: (item: T) => number): number =>
  items.reduce((acc, item) => acc + (Number.isFinite(getValue(item)) ? getValue(item) : 0), 0)

const top = <T>(items: T[], size: number): T[] => items.slice(0, size)

const makeId = (): string => crypto.randomUUID()

const assistantStyleGuide = [
  'Use sempre estilo mensagem de WhatsApp: direto, visual e pronto para encaminhar.',
  'Comece com um título curto com emoji, exemplo: 📊 Resumo do período.',
  'Organize em blocos com emojis e títulos em negrito, exemplo: 🚚 **Por Embarque:**.',
  'Use listas simples com hífen. Não use tabelas markdown, blocos de código, pipes, JSON ou textos longos em parágrafos.',
  'Mostre números importantes com unidade e moeda em pt-BR.',
  'Quando houver muitos itens, traga os principais e diga que pode detalhar o restante, exceto se o usuário pedir todos.',
  'Termine com uma pergunta curta de próximo passo quando fizer sentido.',
].join('\n')

const titleFromQuestion = (question: string): string => {
  const normalized = question.trim().replace(/\s+/g, ' ')
  if (!normalized) return 'Nova conversa'
  return normalized.length > 70 ? `${normalized.slice(0, 67)}...` : normalized
}

const toConversationDto = (row: ConversationRow) => ({
  id: row.id,
  title: row.title,
  range: { from: row.range_from, to: row.range_to },
  aiEnabled: Boolean(row.ai_enabled),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const toMessageDto = (row: MessageRow) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
})

const listUserConversations = async (req: Request): Promise<ReturnType<typeof toConversationDto>[]> => {
  const user = await getRequestUser(req)
  const sb = getSupabase()
  let q = sb
    .from('assistant_conversations')
    .select('id,user_id,title,range_from,range_to,ai_enabled,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(20)

  q = user?.id ? q.eq('user_id', user.id) : q.is('user_id', null)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => toConversationDto(row as ConversationRow))
}

const getConversationWithMessages = async (req: Request, id: string) => {
  const user = await getRequestUser(req)
  const sb = getSupabase()
  let convQuery = sb
    .from('assistant_conversations')
    .select('id,user_id,title,range_from,range_to,ai_enabled,created_at,updated_at')
    .eq('id', id)

  convQuery = user?.id ? convQuery.eq('user_id', user.id) : convQuery.is('user_id', null)

  const { data: conversation, error: convError } = await convQuery.maybeSingle()
  if (convError) throw new Error(convError.message)
  if (!conversation) return null

  const { data: messages, error: messagesError } = await sb
    .from('assistant_messages')
    .select('id,conversation_id,role,content,created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (messagesError) throw new Error(messagesError.message)

  return {
    conversation: toConversationDto(conversation as ConversationRow),
    messages: (messages ?? []).map((row) => toMessageDto(row as MessageRow)),
  }
}

const ensureConversation = async (args: {
  req: Request
  conversationId?: string | null
  question: string
  from: string
  to: string
}) => {
  const existingId = args.conversationId?.trim()
  if (existingId) {
    const existing = await getConversationWithMessages(args.req, existingId)
    if (existing) return existing.conversation
  }

  const user = await getRequestUser(args.req)
  const now = new Date().toISOString()
  const row = {
    id: makeId(),
    user_id: user?.id ?? null,
    title: titleFromQuestion(args.question),
    range_from: args.from,
    range_to: args.to,
    ai_enabled: false,
    created_at: now,
    updated_at: now,
  }

  const { data, error } = await getSupabase()
    .from('assistant_conversations')
    .insert(row)
    .select('id,user_id,title,range_from,range_to,ai_enabled,created_at,updated_at')
    .single()

  if (error) throw new Error(error.message)
  void formatResponsavelNome(user)
  return toConversationDto(data as ConversationRow)
}

const saveConversationTurn = async (args: {
  conversationId: string
  question: string
  answer: string
  from: string
  to: string
  aiEnabled: boolean
}): Promise<void> => {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const { error: insertError } = await sb.from('assistant_messages').insert([
    {
      id: makeId(),
      conversation_id: args.conversationId,
      role: 'user',
      content: args.question,
      created_at: now,
    },
    {
      id: makeId(),
      conversation_id: args.conversationId,
      role: 'assistant',
      content: args.answer,
      created_at: new Date(Date.now() + 1).toISOString(),
    },
  ])
  if (insertError) throw new Error(insertError.message)

  const { error: updateError } = await sb
    .from('assistant_conversations')
    .update({
      range_from: args.from,
      range_to: args.to,
      ai_enabled: args.aiEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.conversationId)

  if (updateError) throw new Error(updateError.message)
}

const buildAssistantContext = async (from: string, to: string): Promise<AssistantContext> => {
  const [rules, records, expensesResult, revenuesResult, programacoesResult, workedDaysResult] = await Promise.all([
    getBillingRules(),
    listOsRecordsForExport({ from, to }),
    listExpenses({ from, to, page: 1, pageSize: 5000, dateBasis: 'date' }),
    listRevenues({ from, to, page: 1, pageSize: 5000, dateBasis: 'date' }),
    listProgramacoes({ from, to, page: 1, pageSize: 8 }),
    listWorkedDaysByClassifier({ from, to }),
  ])

  const stats = buildStats(records, rules, { from, to })
  const expenses = expensesResult.items
  const revenues = revenuesResult.items
  const openExpenses = expenses.filter((item) => item.status === 'a_pagar')
  const paidExpenses = expenses.filter((item) => item.status === 'paga')
  const scheduledExpenses = expenses.filter((item) => item.status === 'agendada')
  const receivableRevenues = revenues.filter((item) => item.status === 'a_receber')
  const receivedRevenues = revenues.filter((item) => item.status === 'recebida')
  const forecastRevenues = revenues.filter((item) => item.status === 'prevista')

  const finance = {
    expenses: {
      total: expensesResult.totalAmountBRL,
      open: sum(openExpenses, (item) => item.amountBRL),
      paid: sum(paidExpenses, (item) => item.amountBRL),
      scheduled: sum(scheduledExpenses, (item) => item.amountBRL),
      upcoming: top(
        [...openExpenses, ...scheduledExpenses]
          .sort((a, b) => String(a.dueDate ?? a.scheduledPaymentDate ?? a.date).localeCompare(String(b.dueDate ?? b.scheduledPaymentDate ?? b.date)))
          .map((item) => ({
            date: item.date,
            dueDate: item.dueDate,
            category: item.category,
            description: item.description,
            amountBRL: item.amountBRL,
            status: item.status,
          })),
        8,
      ),
    },
    revenues: {
      total: revenuesResult.totalAmountBRL,
      receivable: sum(receivableRevenues, (item) => item.amountBRL),
      received: sum(receivedRevenues, (item) => item.amountBRL),
      forecast: sum(forecastRevenues, (item) => item.amountBRL),
      upcoming: top(
        [...receivableRevenues, ...forecastRevenues]
          .sort((a, b) => String(a.expectedReceiptDate ?? a.dueDate ?? a.date).localeCompare(String(b.expectedReceiptDate ?? b.dueDate ?? b.date)))
          .map((item) => ({
            date: item.date,
            dueDate: item.dueDate,
            expectedReceiptDate: item.expectedReceiptDate,
            clientName: item.clientName,
            description: item.description,
            amountBRL: item.amountBRL,
            status: item.status,
          })),
        8,
      ),
    },
    resultEstimated: stats.kpis.revenueEstimatedBRL - expensesResult.totalAmountBRL,
    resultPosted: revenuesResult.totalAmountBRL - expensesResult.totalAmountBRL,
  }

  const highlights = [
    `Volume: ${tons.format(stats.kpis.tonsTotal)} t em ${num.format(stats.kpis.osCount)} OS.`,
    `RNE: ${num.format(stats.kpis.rneSeries.reduce((acc, item) => acc + item.value, 0))} no período.`,
    `Faturamento estimado: ${brl.format(stats.kpis.revenueEstimatedBRL)}.`,
    `Despesas lançadas: ${brl.format(expensesResult.totalAmountBRL)}; receitas lançadas: ${brl.format(revenuesResult.totalAmountBRL)}.`,
    `Dias trabalhados: ${num.format(workedDaysResult.totals.totalClassifierDays)} diárias por colaborador em ${num.format(workedDaysResult.totals.daysWorked)} dia(s) único(s).`,
  ]

  return {
    range: { from, to },
    stats,
    finance,
    programacoes: {
      total: programacoesResult.total,
      latest: programacoesResult.items.map((item) => ({
        id: item.id,
        data: item.data,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    },
    workedDays: {
      totals: workedDaysResult.totals,
      classifiers: top(workedDaysResult.items, 30).map((item) => ({
        classifierName: item.classifierName,
        daysWorked: item.daysWorked,
        volumeDays: item.volumeDays,
        rneDays: item.rneDays,
        tons: item.tons,
        rneCount: item.rneCount,
        osCount: item.osCount,
        dates: top(item.dates, 20).map((date) => ({
          date: date.date,
          tons: date.tons,
          rneCount: date.rneCount,
          osCount: date.osCount,
          osIds: date.osIds,
          serviceOrders: top(date.serviceOrders, 12),
        })),
      })),
    },
    highlights,
  }
}

const localAnswer = (question: string, context: AssistantContext): string => {
  const q = question.toLowerCase()
  const rneTotal = context.stats.kpis.rneSeries.reduce((acc, item) => acc + item.value, 0)
  const topClient = context.stats.breakdowns.byClient[0]
  const topPoint = context.stats.breakdowns.byEmbarkPoint[0]
  const points = top(context.stats.breakdowns.byEmbarkPoint, q.includes('todos') || q.includes('inteiro') || q.includes('completo') ? 30 : 10)
  const classifiers = top(context.stats.breakdowns.byClassifier, q.includes('todos') || q.includes('inteiro') || q.includes('completo') ? 30 : 10)
  const workedDayClassifiers = top(
    context.workedDays.classifiers,
    q.includes('todos') || q.includes('inteiro') || q.includes('completo') ? 30 : 12,
  )

  const base = [
    `📊 **Resumo do período**`,
    `${context.range.from} → ${context.range.to}`,
    '',
    `📌 **Totais:**`,
    `- Volume: ${tons.format(context.stats.kpis.tonsTotal)} t`,
    `- OS: ${num.format(context.stats.kpis.osCount)}`,
    `- RNEs: ${num.format(rneTotal)}`,
    `- Laudos/cargas: ${num.format(context.stats.kpis.loadCount)}`,
    `- Diárias: ${num.format(context.stats.kpis.dailyFeeCount)}`,
    `- Dias trabalhados por colaborador: ${num.format(context.workedDays.totals.totalClassifierDays)}`,
    `- Faturamento estimado: ${brl.format(context.stats.kpis.revenueEstimatedBRL)}`,
    '',
    `💰 **Financeiro:**`,
    `- Receitas lançadas: ${brl.format(context.finance.revenues.total)}`,
    `- Despesas lançadas: ${brl.format(context.finance.expenses.total)}`,
    `- Resultado estimado após despesas: ${brl.format(context.finance.resultEstimated)}`,
  ]

  if (topClient || topPoint) {
    base.push('', '⭐ **Destaques:**')
    if (topClient) base.push(`- Cliente: ${topClient.clientName} — ${tons.format(topClient.tons)} t — ${brl.format(topClient.revenueEstimatedBRL)}`)
    if (topPoint) base.push(`- Embarque: ${topPoint.embarkPoint} — ${tons.format(topPoint.tons)} t`)
  }

  if (points.length) {
    base.push('', '🚚 **Por Embarque:**')
    base.push(...points.map((item) => `- ${item.embarkPoint} — ${tons.format(item.tons)} t — ${brl.format(item.revenueEstimatedBRL)}`))
  }

  if (classifiers.length) {
    base.push('', '👨‍💼 **Por Classificador:**')
    base.push(...classifiers.map((item) => `- ${item.classifierName} — ${tons.format(item.tons)} t`))
  }

  base.push('', '🔍 Quer que eu detalhe por cliente, OS ou dia?')

  if (q.includes('pend') || q.includes('venc') || q.includes('pagar') || q.includes('receber')) {
    const expenses = context.finance.expenses.upcoming
      .map((item) => `- ${item.dueDate ?? item.date} — ${item.description} (${item.category}) — ${brl.format(item.amountBRL)} — ${item.status}`)
      .join('\n')
    const revenues = context.finance.revenues.upcoming
      .map((item) => `- ${item.expectedReceiptDate ?? item.dueDate ?? item.date} — ${item.description} — ${brl.format(item.amountBRL)} — ${item.status}`)
      .join('\n')
    return [
      `⚠️ **Pendências do período**`,
      `${context.range.from} → ${context.range.to}`,
      '',
      `💸 **Despesas em aberto/agendadas:** ${brl.format(context.finance.expenses.open + context.finance.expenses.scheduled)}`,
      expenses || '- Nenhuma despesa pendente encontrada no filtro.',
      '',
      `💵 **Receitas previstas/a receber:** ${brl.format(context.finance.revenues.receivable + context.finance.revenues.forecast)}`,
      revenues || '- Nenhuma receita pendente encontrada no filtro.',
      '',
      '🔍 Quer que eu separe por vencimento mais próximo?',
    ].join('\n')
  }

  if (q.includes('rne')) {
    return [
      `📌 **RNE no período**`,
      `${context.range.from} → ${context.range.to}`,
      '',
      `- Total: ${num.format(rneTotal)}`,
      '',
      `📅 **Por dia:**`,
      ...top(context.stats.kpis.rneSeries.filter((item) => item.value > 0), 12).map((item) => `- ${item.date} — ${num.format(item.value)}`),
      '',
      '🔍 Quer que eu liste as OS com RNE?',
    ].join('\n')
  }

  if (q.includes('diaria') || q.includes('diárias') || q.includes('dias trabalh') || q.includes('trabalhou') || q.includes('classificador')) {
    return [
      `👨‍💼 **Dias trabalhados por classificador**`,
      `${context.range.from} → ${context.range.to}`,
      '',
      `📌 **Totais:**`,
      `- Classificadores: ${num.format(context.workedDays.totals.classifiers)}`,
      `- Dias únicos no período: ${num.format(context.workedDays.totals.daysWorked)}`,
      `- Total de diárias por colaborador: ${num.format(context.workedDays.totals.totalClassifierDays)}`,
      `- Volume vinculado: ${tons.format(context.workedDays.totals.tons)} t`,
      `- RNE: ${num.format(context.workedDays.totals.rneCount)}`,
      `- O.S.: ${num.format(context.workedDays.totals.osCount)}`,
      '',
      `🏅 **Por colaborador:**`,
      ...(workedDayClassifiers.length
        ? workedDayClassifiers.map(
            (item) =>
              `- ${item.classifierName}: ${num.format(item.daysWorked)} diária(s) — ${tons.format(item.tons)} t — ${num.format(item.rneCount)} RNE — ${num.format(item.osCount)} O.S.`,
          )
        : ['- Nenhum classificador com movimentação no período.']),
      '',
      '🔍 Quer que eu abra por dia e O.S. de algum classificador?',
    ].join('\n')
  }

  return base.join('\n')
}

const callAiProvider = async (question: string, messages: ChatMessage[], context: AssistantContext): Promise<string | null> => {
  const openAiKey = process.env.OPENAI_API_KEY
  const openRouterKey = process.env.OPENROUTER_API_KEY
  const isOpenRouter = !openAiKey && Boolean(openRouterKey)
  const apiKey = openAiKey || openRouterKey
  if (!apiKey) return null

  const model = isOpenRouter
    ? process.env.OPENROUTER_MODEL || 'openrouter/free'
    : process.env.OPENAI_MODEL || 'gpt-4o-mini'
  const endpoint = isOpenRouter
    ? 'https://openrouter.ai/api/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions'
  const contextJson = JSON.stringify(context, null, 2).slice(0, 24000)
  const recentMessages = messages.slice(-8)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(isOpenRouter
        ? {
            'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://inspectcheck-dashboard-walison.fly.dev',
            'X-Title': 'InspectCheck Dashboard',
          }
        : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            `Você é a Iris, a inteligência operacional e financeira da InspectCheck. Quando se apresentar, mencione seu nome. Responda em português do Brasil, com objetividade, usando somente os dados do contexto. Se faltar dado, diga claramente. Destaque alertas, pendências e números importantes. Não invente valores. Você tem visão de operação, faturamento, RNE, financeiro, programação e dias trabalhados por classificador. Para perguntas sobre diárias, dias trabalhados, quem trabalhou, classificador ou colaborador, use o bloco workedDays do contexto. O período do contexto já foi ajustado conforme a pergunta quando ela cita datas como hoje, ontem, dia específico ou mês; use esse período do contexto e não diga que está limitado ao filtro visual se a pergunta citou outro período.\n\nPadrão obrigatório de formato:\n${assistantStyleGuide}`,
        },
        {
          role: 'system',
          content: `Contexto real do sistema em JSON:\n${contextJson}`,
        },
        ...recentMessages,
        { role: 'user', content: question },
      ],
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `${isOpenRouter ? 'OpenRouter' : 'OpenAI'} HTTP ${response.status}`)
  }

  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content?.trim() || null
}

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const conversations = await listUserConversations(req)
    res.status(200).json({ success: true, conversations })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao listar conversas',
    })
  }
})

router.get('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'ID obrigatório' })
      return
    }
    const result = await getConversationWithMessages(req, id)
    if (!result) {
      res.status(404).json({ success: false, error: 'Conversa não encontrada' })
      return
    }
    res.status(200).json({ success: true, ...result })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao abrir conversa',
    })
  }
})

router.delete('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '').trim()
    if (!id) {
      res.status(400).json({ success: false, error: 'ID obrigatório' })
      return
    }

    const user = await getRequestUser(req)
    let query = getSupabase().from('assistant_conversations').delete().eq('id', id)
    query = user?.id ? query.eq('user_id', user.id) : query.is('user_id', null)
    const { error } = await query
    if (error) throw new Error(error.message)

    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao apagar conversa',
    })
  }
})

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = (req.body ?? {}) as {
      question?: unknown
      messages?: ChatMessage[]
      conversationId?: unknown
      range?: { from?: unknown; to?: unknown }
    }
    const question = String(body.question ?? '').trim()
    if (!question) {
      res.status(400).json({ success: false, error: 'Pergunta obrigatória' })
      return
    }

    const today = todayInTimeZone('America/Cuiaba')
    const requestedRange = inferRangeFromQuestion(question, today)
    const from = requestedRange?.from ?? cleanDate(body.range?.from) ?? today
    const to = requestedRange?.to ?? cleanDate(body.range?.to) ?? today
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') : []
    const context = await buildAssistantContext(from, to)
    const conversation = await ensureConversation({
      req,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
      question,
      from,
      to,
    })

    let answer: string | null = null
    let aiEnabled = false
    try {
      answer = await callAiProvider(question, messages, context)
      aiEnabled = Boolean(answer)
    } catch (e: unknown) {
      answer = `${localAnswer(question, context)}\n\nObservação: a IA externa não respondeu agora (${e instanceof Error ? e.message : 'erro desconhecido'}). Usei a análise local com os dados do sistema.`
    }

    const finalAnswer = answer ?? localAnswer(question, context)
    await saveConversationTurn({
      conversationId: conversation.id,
      question,
      answer: finalAnswer,
      from,
      to,
      aiEnabled,
    })

    res.status(200).json({
      success: true,
      answer: finalAnswer,
      aiEnabled,
      conversation,
      contextSummary: {
        range: context.range,
        highlights: context.highlights,
        rangeSource: requestedRange?.reason ?? 'período selecionado',
      },
    })
  } catch (e: unknown) {
    res.status(500).json({
      success: false,
      error: e instanceof Error ? e.message : 'Falha no assistente',
    })
  }
})

export default router
