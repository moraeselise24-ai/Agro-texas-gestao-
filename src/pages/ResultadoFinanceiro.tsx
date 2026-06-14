import { useEffect, useMemo, useState } from "react";
import { Banknote, Calculator, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import EChart from "@/components/EChart";
import FitValue from "@/components/FitValue";
import StatCard from "@/components/StatCard";
import { useToast } from "@/components/ToastProvider";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";

type ExpenseStatus = "agendada" | "a_pagar" | "paga" | "cancelada";
type RevenueStatus = "prevista" | "a_receber" | "recebida" | "cancelada";

type Expense = {
  id: string;
  date: string;
  category: string;
  amountBRL: number;
  status: ExpenseStatus;
};

type Revenue = {
  id: string;
  date: string;
  category: string;
  amountBRL: number;
  status: RevenueStatus;
};

type Stats = {
  kpis: {
    revenueEstimatedBRL: number;
    revenueDailySeries: Array<{ date: string; value: number }>;
  };
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const addToMap = (map: Map<string, number>, key: string, value: number) => {
  map.set(key, (map.get(key) ?? 0) + value);
};

const dayLabel = (value: string): string => {
  const [, m, d] = value.split("-");
  return m && d ? `${d}/${m}` : value;
};

export default function ResultadoFinanceiro() {
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      page: "1",
      pageSize: "5000",
      dateBasis: "date",
    });

    Promise.all([
      apiGet<{ stats: Stats }>(`/api/stats?from=${range.from}&to=${range.to}`),
      apiGet<{ items: Expense[] }>(`/api/expenses?${params.toString()}`),
      apiGet<{ items: Revenue[] }>(`/api/revenues?${params.toString()}`),
    ])
      .then(([statsResponse, expensesResponse, revenuesResponse]) => {
        setStats(statsResponse.stats);
        setExpenses(expensesResponse.items ?? []);
        setRevenues(revenuesResponse.items ?? []);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar resultado financeiro")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [range.from, range.to]);

  const metrics = useMemo(() => {
    const estimatedRevenue = stats?.kpis.revenueEstimatedBRL ?? 0;
    const postedRevenue = revenues
      .filter((item) => item.status !== "cancelada")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const receivedRevenue = revenues
      .filter((item) => item.status === "recebida")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const receivableRevenue = revenues
      .filter((item) => item.status === "prevista" || item.status === "a_receber")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const totalExpenses = expenses
      .filter((item) => item.status !== "cancelada")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const paidExpenses = expenses
      .filter((item) => item.status === "paga")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const openExpenses = expenses
      .filter((item) => item.status === "agendada" || item.status === "a_pagar")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const realResult = postedRevenue - totalExpenses;
    const cashResult = receivedRevenue - paidExpenses;
    const projectedResult = Math.max(postedRevenue, estimatedRevenue) - totalExpenses;
    const projectedMargin = Math.max(postedRevenue, estimatedRevenue)
      ? (projectedResult / Math.max(postedRevenue, estimatedRevenue)) * 100
      : 0;

    return {
      estimatedRevenue,
      postedRevenue,
      receivedRevenue,
      receivableRevenue,
      totalExpenses,
      paidExpenses,
      openExpenses,
      realResult,
      cashResult,
      projectedResult,
      projectedMargin,
    };
  }, [expenses, revenues, stats]);

  const series = useMemo(() => {
    const dates = new Set<string>();
    const revenueByDay = new Map<string, number>();
    const expenseByDay = new Map<string, number>();
    const estimatedByDay = new Map<string, number>();

    for (const item of revenues) {
      if (item.status === "cancelada") continue;
      dates.add(item.date);
      addToMap(revenueByDay, item.date, item.amountBRL);
    }
    for (const item of expenses) {
      if (item.status === "cancelada") continue;
      dates.add(item.date);
      addToMap(expenseByDay, item.date, item.amountBRL);
    }
    for (const item of stats?.kpis.revenueDailySeries ?? []) {
      dates.add(item.date);
      addToMap(estimatedByDay, item.date, item.value);
    }

    return [...dates]
      .sort((a, b) => a.localeCompare(b))
      .map((date) => ({
        date,
        receita: revenueByDay.get(date) ?? 0,
        despesa: expenseByDay.get(date) ?? 0,
        estimado: estimatedByDay.get(date) ?? 0,
        resultado:
          Math.max(revenueByDay.get(date) ?? 0, estimatedByDay.get(date) ?? 0) -
          (expenseByDay.get(date) ?? 0),
      }));
  }, [expenses, revenues, stats]);

  const charts = useMemo(() => {
    const axisColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(23,33,27,0.58)";
    const axisLineColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,101,52,0.16)";
    const splitLineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(22,101,52,0.1)";
    const tooltipBg = isDark ? "rgba(11,15,25,0.92)" : "rgba(255,255,255,0.96)";
    const tooltipText = isDark ? "rgba(255,255,255,0.88)" : "rgba(23,33,27,0.86)";
    const legendText = isDark ? "rgba(255,255,255,0.62)" : "rgba(23,33,27,0.66)";

    return {
      fluxo: {
        backgroundColor: "transparent",
        color: ["#34D399", "#F87171", "#60A5FA"],
        grid: { left: 12, right: 18, top: 36, bottom: 24, containLabel: true },
        legend: { top: 0, textStyle: { color: legendText } },
        tooltip: {
          trigger: "axis" as const,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
          valueFormatter: (value: number) => brl.format(value),
        },
        xAxis: {
          type: "category",
          data: series.map((item) => dayLabel(item.date)),
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: axisColor, formatter: (value: number) => brlCompact.format(value) },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "Receitas",
            type: "bar",
            barMaxWidth: 36,
            itemStyle: { borderRadius: [8, 8, 0, 0] },
            data: series.map((item) => Math.round(item.receita * 100) / 100),
          },
          {
            name: "Despesas",
            type: "bar",
            barMaxWidth: 36,
            itemStyle: { borderRadius: [8, 8, 0, 0] },
            data: series.map((item) => Math.round(item.despesa * 100) / 100),
          },
          {
            name: "Faturamento estimado",
            type: "line",
            smooth: true,
            symbolSize: 7,
            lineStyle: { width: 3 },
            data: series.map((item) => Math.round(item.estimado * 100) / 100),
          },
        ],
      },
      resultado: {
        backgroundColor: "transparent",
        color: ["#FBBF24"],
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: {
          trigger: "axis" as const,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
          valueFormatter: (value: number) => brl.format(value),
        },
        xAxis: {
          type: "category",
          data: series.map((item) => dayLabel(item.date)),
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          axisLabel: { color: axisColor, formatter: (value: number) => brlCompact.format(value) },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "Resultado projetado",
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { width: 3 },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(251,191,36,0.25)" },
                  { offset: 1, color: "rgba(251,191,36,0.02)" },
                ],
              },
            },
            data: series.map((item) => Math.round(item.resultado * 100) / 100),
          },
        ],
      },
    };
  }, [isDark, series]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Resultado
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Financeiro gerencial
          </h2>
          <div className="mt-2 text-sm text-app-soft">
            Receitas, despesas e faturamento estimado no período.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            Atualizar
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatCard
          label="Receitas"
          value={loading ? "-" : brl.format(metrics.postedRevenue)}
          detail={`Recebidas: ${brl.format(metrics.receivedRevenue)}`}
          accent="green"
          icon={<TrendingUp className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Despesas"
          value={loading ? "-" : brl.format(metrics.totalExpenses)}
          detail={`Em aberto: ${brl.format(metrics.openExpenses)}`}
          accent="amber"
          icon={<TrendingDown className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Resultado real"
          value={loading ? "-" : brl.format(metrics.realResult)}
          detail="Receitas lançadas - despesas"
          accent={metrics.realResult >= 0 ? "green" : "amber"}
          icon={<Calculator className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Resultado projetado"
          value={loading ? "-" : brl.format(metrics.projectedResult)}
          detail={`Margem: ${metrics.projectedMargin.toFixed(1)}%`}
          accent={metrics.projectedResult >= 0 ? "green" : "amber"}
          icon={<Banknote className="h-4 w-4 text-app-muted" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Receitas x despesas"
          subtitle="Comparativo diário com faturamento estimado"
          expandable={{
            option: charts.fluxo,
            chartKey: `finance-flow-${range.from}-${range.to}-${series.length}`,
          }}
        >
          <div className="h-[330px]">
            <EChart
              option={charts.fluxo}
              height={330}
              chartKey={`finance-flow-${range.from}-${range.to}-${series.length}`}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Resultado projetado"
          subtitle="Maior valor entre receita lançada e estimativa, menos despesas"
          expandable={{
            option: charts.resultado,
            chartKey: `finance-result-${range.from}-${range.to}-${series.length}`,
          }}
        >
          <div className="h-[330px]">
            <EChart
              option={charts.resultado}
              height={330}
              chartKey={`finance-result-${range.from}-${range.to}-${series.length}`}
            />
          </div>
        </ChartCard>
      </section>

      <ChartCard
        title="Conciliação de faturamento"
        subtitle="Comparação entre estimativa operacional e receitas lançadas"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.16em] text-app-faint">
              Estimado
            </div>
            <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
              {brl.format(metrics.estimatedRevenue)}
            </FitValue>
          </div>
          <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.16em] text-app-faint">
              Receitas lançadas
            </div>
            <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
              {brl.format(metrics.postedRevenue)}
            </FitValue>
          </div>
          <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.16em] text-app-faint">
              A conciliar
            </div>
            <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
              {brl.format(Math.max(0, metrics.estimatedRevenue - metrics.postedRevenue))}
            </FitValue>
          </div>
          <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.16em] text-app-faint">
              A receber
            </div>
            <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
              {brl.format(metrics.receivableRevenue)}
            </FitValue>
          </div>
        </div>
      </ChartCard>

      <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
        A leitura projetada evita contar duas vezes quando a receita ainda não foi lançada: ela usa o maior valor entre faturamento estimado e receitas lançadas, e subtrai as despesas do período.
      </div>
    </div>
  );
}
