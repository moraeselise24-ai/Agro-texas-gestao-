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
  date: string
  clientName: string
  embarkPoint: string
  tons: number
  rne: number | null
  status: string | null
}

export type StatsResponse = {
  range: DateRange
  kpis: {
    osCount: number
    tonsTotal: number
    dailyFeeCount: number
    tonsDailySeries: Array<{ date: string; tons: number }>
    tonsMonthlySeries: Array<{ month: string; tons: number }>
    rneSeries: Array<{ date: string; value: number }>
    revenueEstimatedBRL: number
    lastUpdatedAt: string | null
  }
  breakdowns: {
    byClient: Array<{ clientName: string; tons: number; revenueEstimatedBRL: number }>
    byEmbarkPoint: Array<{ embarkPoint: string; tons: number; revenueEstimatedBRL: number }>
  }
}
