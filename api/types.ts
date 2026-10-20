export type DateRange = {
  from: string
  to: string
}

export type BillingRules = {
  dailyFeeBRL: number
  baseTariffBRLPerTon: number
  minCadenceTons: number
  excessMultiplier: number
}

export type OsRecord = {
  id: string
  osId?: string | null
  contractNumber?: string | null
  date: string
  clientName: string
  embarkPoint: string
  classifierName?: string | null
  plate: string | null
  tons: number
  rne: number | null
  status: string | null
}

export type Classificador = {
  id: string
  nome: string
  email: string | null
  whatsapp: string | null
  municipio: string | null
  uf: string | null
  status: string | null
  ativo: boolean
}

export type ProgramacaoItem = {
  id: string
  programacaoId: string
  classificadorId: string | null
  classificadorNome: string
  cliente: string | null
  localEmbarque: string
  osId: string
  destino: string | null
  fazendaArmazem: string | null
  volumeRemanescente: number | null
  volumeEmbarcado: number | null
  volumeOs: number | null
  produto: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type Programacao = {
  id: string
  data: string
  itens: ProgramacaoItem[]
  createdByUserId: string | null
  responsavelNome: string | null
  importSourceDate: string | null
  importReference: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ServiceOrderDraftStatus =
  | 'rascunho'
  | 'pendente_envio'
  | 'enviando'
  | 'criada'
  | 'erro'
  | 'cancelada'

export type ServiceOrderDraft = {
  id: string
  referenceCode: string
  requestedDate: string
  clientName: string
  embarkPoint: string
  embarkPointMunicipio: string | null
  embarkPointUf: string | null
  embarkPointNeedsCreate: boolean
  destination: string
  destinationMunicipio: string | null
  destinationUf: string | null
  destinationNeedsCreate: boolean
  product: string
  contractNumber: string | null
  lotKg: number
  classifierName: string | null
  producerName: string | null
  notes: string | null
  status: ServiceOrderDraftStatus
  classificOsId: string | null
  botError: string | null
  sentAt: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdAt: string | null
  updatedAt: string | null
  sourceType?: string | null
  sourceKey?: string | null
}

export type ExpenseStatus = 'agendada' | 'a_pagar' | 'paga' | 'cancelada'

export type RecurrenceFrequency = 'semanal' | 'mensal' | 'anual'

export type ExpenseCategory = {
  id: string
  name: string
  active: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type Expense = {
  id: string
  date: string
  category: string
  description: string
  supplier: string | null
  amountBRL: number
  paymentMethod: string | null
  documentNumber: string | null
  dueDate: string | null
  scheduledPaymentDate: string | null
  paidAt: string | null
  status: ExpenseStatus
  isRecurring: boolean
  recurrenceFrequency: RecurrenceFrequency | null
  recurrenceUntil: string | null
  notes: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdAt: string | null
  updatedAt: string | null
  sourceType?: string | null
  sourceKey?: string | null
}

export type RevenueStatus = 'prevista' | 'a_receber' | 'recebida' | 'cancelada'

export type RevenueCategory = {
  id: string
  name: string
  active: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type Revenue = {
  id: string
  date: string
  category: string
  clientName: string | null
  description: string
  amountBRL: number
  paymentMethod: string | null
  documentNumber: string | null
  dueDate: string | null
  expectedReceiptDate: string | null
  receivedAt: string | null
  status: RevenueStatus
  isRecurring: boolean
  recurrenceFrequency: RecurrenceFrequency | null
  recurrenceUntil: string | null
  notes: string | null
  createdByUserId: string | null
  createdByName: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type AssetStatus = 'ativo' | 'manutencao' | 'emprestado' | 'baixado' | 'vendido' | 'perdido'

export type AssetCondition = 'novo' | 'bom' | 'regular' | 'critico'

export type Asset = {
  id: string
  code: string
  name: string
  category: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  location: string | null
  responsibleName: string | null
  status: AssetStatus
  condition: AssetCondition
  acquisitionDate: string | null
  acquisitionValueBRL: number
  usefulLifeMonths: number | null
  currentValueBRL: number
  warrantyUntil: string | null
  nextMaintenanceDate: string | null
  disposalDate: string | null
  disposalReason: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type StatsResponse = {
  range: DateRange
  kpis: {
    osCount: number
    tonsTotal: number
    dailyFeeCount: number
    tonsDailySeries: Array<{ date: string; tons: number }>
    dailyFeeSeries: Array<{ date: string; value: number }>
    revenueDailySeries: Array<{ date: string; value: number }>
    tonsMonthlySeries: Array<{ month: string; tons: number }>
    rneSeries: Array<{ date: string; value: number }>
    revenueEstimatedBRL: number
    lastUpdatedAt: string | null
    loadCount: number
    avgTonsPerOs: number
    avgTonsPerDay: number
  }
  breakdowns: {
    byClient: Array<{ clientName: string; tons: number; revenueEstimatedBRL: number }>
    byEmbarkPoint: Array<{ embarkPoint: string; tons: number; revenueEstimatedBRL: number }>
    byClassifier: Array<{ classifierName: string; tons: number }>
    byOs: Array<{ osId: string; clientName: string; embarkPoint: string; tons: number }>
  }
}

export type WorkedDayClassifierSummary = {
  classifierName: string
  daysWorked: number
  volumeDays: number
  rneDays: number
  tons: number
  rneCount: number
  osCount: number
  dates: Array<{
    date: string
    tons: number
    rneCount: number
    osCount: number
    osIds: string[]
    serviceOrders: Array<{
      osId: string
      farmName: string
      tons: number
      rneCount: number
    }>
  }>
}

export type ClassifierPaymentType = 'pagamento' | 'adiantamento'

export type ClassifierPaymentEntry = {
  id: string
  classifierName: string
  periodFrom: string
  periodTo: string
  amountBRL: number
  paidAt: string
  type: ClassifierPaymentType
  notes: string | null
  createdByName: string | null
  createdAt: string | null
}

export type WorkedDayCompensation = {
  dailyRateBRL: number | null
  projectedPaymentBRL: number
  paidAmountBRL: number
  advanceAmountBRL: number
  balanceBRL: number
  paymentStatus: 'a_configurar' | 'pendente' | 'parcial' | 'pago' | 'credito'
  payments: ClassifierPaymentEntry[]
}

export type WorkedDaysTotals = {
  classifiers: number
  daysWorked: number
  totalClassifierDays: number
  tons: number
  rneCount: number
  osCount: number
  projectedPaymentBRL?: number
  paidAmountBRL?: number
  balanceBRL?: number
}
