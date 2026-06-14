import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  PieChart,
  RefreshCw,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import EChart from "@/components/EChart";
import StatCard from "@/components/StatCard";
import { useToast } from "@/components/ToastProvider";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";

type ExpenseStatus = "agendada" | "a_pagar" | "paga" | "cancelada";

type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
};

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  supplier: string | null;
  amountBRL: number;
  paymentMethod: string | null;
  documentNumber: string | null;
  dueDate: string | null;
  scheduledPaymentDate: string | null;
  paidAt: string | null;
  status: ExpenseStatus;
  isRecurring: boolean;
  recurrenceFrequency: string | null;
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

const num = new Intl.NumberFormat("pt-BR");

const statusLabels: Record<ExpenseStatus, string> = {
  agendada: "Agendada",
  a_pagar: "A pagar",
  paga: "Paga",
  cancelada: "Cancelada",
};

const formatDate = (value: string | null): string => {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
};

const dayLabel = (value: string): string => {
  const [, m, d] = value.split("-");
  return m && d ? `${d}/${m}` : value;
};

const addToMap = (map: Map<string, number>, key: string, value: number) => {
  map.set(key, (map.get(key) ?? 0) + value);
};

export default function DashboardDespesas() {
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<ExpenseStatus | "all">("all");

  const loadCategories = () => {
    apiGet<{ categories: ExpenseCategory[] }>("/api/expenses/categories")
      .then((r) => setCategories(r.categories ?? []))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar categorias")
      );
  };

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      page: "1",
      pageSize: "5000",
      dateBasis: "date",
    });
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);

    apiGet<{ items: Expense[] }>(`/api/expenses?${params.toString()}`)
      .then((r) => setItems(r.items ?? []))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar despesas")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    load();
  }, [range.from, range.to, category, status]);

  const metrics = useMemo(() => {
    const total = items.reduce((acc, item) => acc + item.amountBRL, 0);
    const openTotal = items
      .filter((item) => item.status === "agendada" || item.status === "a_pagar")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const paidTotal = items
      .filter((item) => item.status === "paga")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const canceledTotal = items
      .filter((item) => item.status === "cancelada")
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const recurringTotal = items
      .filter((item) => item.isRecurring)
      .reduce((acc, item) => acc + item.amountBRL, 0);
    const average = items.length ? total / items.length : 0;
    return { total, openTotal, paidTotal, canceledTotal, recurringTotal, average };
  }, [items]);

  const rows = useMemo(() => {
    const byDay = new Map<string, number>();
    const byCategory = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const bySupplier = new Map<string, number>();
    const byRecurrence = new Map<string, number>();

    for (const item of items) {
      addToMap(byDay, item.date, item.amountBRL);
      addToMap(byCategory, item.category || "Sem categoria", item.amountBRL);
      addToMap(byStatus, statusLabels[item.status] ?? item.status, item.amountBRL);
      addToMap(bySupplier, item.supplier || "Não informado", item.amountBRL);
      addToMap(byRecurrence, item.isRecurring ? "Recorrente" : "Avulsa", item.amountBRL);
    }

    const sortValue = ([, a]: [string, number], [, b]: [string, number]) => b - a;
    return {
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)),
      byCategory: [...byCategory.entries()].sort(sortValue),
      byStatus: [...byStatus.entries()].sort(sortValue),
      bySupplier: [...bySupplier.entries()].sort(sortValue).slice(0, 10),
      byRecurrence: [...byRecurrence.entries()].sort(sortValue),
      nextDue: items
        .filter((item) => item.status !== "paga" && item.status !== "cancelada" && item.dueDate)
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 8),
    };
  }, [items]);

  const charts = useMemo(() => {
    const axisColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(23,33,27,0.58)";
    const axisLineColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,101,52,0.16)";
    const splitLineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(22,101,52,0.1)";
    const tooltipBg = isDark ? "rgba(11,15,25,0.92)" : "rgba(255,255,255,0.96)";
    const tooltipText = isDark ? "rgba(255,255,255,0.88)" : "rgba(23,33,27,0.86)";
    const legendText = isDark ? "rgba(255,255,255,0.62)" : "rgba(23,33,27,0.66)";
    const pieBorder = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.75)";
    const pieLine = isDark ? "rgba(255,255,255,0.32)" : "rgba(22,101,52,0.28)";

    const tooltip = {
      backgroundColor: tooltipBg,
      borderColor: "rgba(148,163,184,0.18)",
      textStyle: { color: tooltipText },
      valueFormatter: (value: number) => brl.format(value),
    };

    const pieLabel = {
      color: axisColor,
      formatter: "{b}\n{d}%",
      lineHeight: 18,
    };

    return {
      porDia: {
        backgroundColor: "transparent",
        color: ["#34D399"],
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, trigger: "axis" },
        xAxis: {
          type: "category",
          data: rows.byDay.map(([date]) => dayLabel(date)),
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
            name: "Despesas",
            type: "line",
            smooth: true,
            symbolSize: 7,
            lineStyle: { width: 3, color: "#34D399" },
            itemStyle: { color: "#34D399" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(52,211,153,0.32)" },
                  { offset: 1, color: "rgba(52,211,153,0.02)" },
                ],
              },
            },
            data: rows.byDay.map(([, value]) => Math.round(value * 100) / 100),
          },
        ],
      },
      porCategoria: {
        backgroundColor: "transparent",
        color: ["#34D399", "#FBBF24", "#60A5FA", "#A78BFA", "#F472B6", "#2DD4BF", "#FB7185", "#94A3B8"],
        tooltip: { ...tooltip, trigger: "item" },
        legend: {
          orient: "vertical",
          right: 10,
          top: "middle",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { color: legendText, fontSize: 12 },
        },
        series: [
          {
            name: "Categorias",
            type: "pie",
            radius: ["42%", "68%"],
            center: ["36%", "52%"],
            minAngle: 3,
            avoidLabelOverlap: true,
            itemStyle: {
              borderColor: pieBorder,
              borderWidth: 2,
              shadowBlur: 14,
              shadowColor: "rgba(15,23,42,0.18)",
            },
            label: pieLabel,
            labelLine: { length: 14, length2: 18, lineStyle: { color: pieLine } },
            data: rows.byCategory.slice(0, 8).map(([name, value]) => ({ name, value })),
          },
        ],
      },
      porStatus: {
        backgroundColor: "transparent",
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: { ...tooltip, trigger: "axis" },
        xAxis: {
          type: "category",
          data: rows.byStatus.map(([name]) => name),
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
            name: "Valor",
            type: "bar",
            barMaxWidth: 48,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "#FBBF24" },
                  { offset: 1, color: "#34D399" },
                ],
              },
            },
            data: rows.byStatus.map(([, value]) => Math.round(value * 100) / 100),
          },
        ],
      },
      topFornecedores: {
        backgroundColor: "transparent",
        grid: { left: 16, right: 20, top: 18, bottom: 12, containLabel: true },
        tooltip: { ...tooltip, trigger: "axis" },
        xAxis: {
          type: "value",
          axisLabel: { color: axisColor, formatter: (value: number) => brlCompact.format(value) },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: rows.bySupplier.map(([name]) => name),
          axisLabel: {
            color: axisColor,
            width: 150,
            overflow: "truncate",
          },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        series: [
          {
            name: "Despesas",
            type: "bar",
            barMaxWidth: 24,
            itemStyle: { color: "#60A5FA", borderRadius: [0, 8, 8, 0] },
            data: rows.bySupplier.map(([, value]) => Math.round(value * 100) / 100),
          },
        ],
      },
      recorrencia: {
        backgroundColor: "transparent",
        color: ["#A78BFA", "#34D399"],
        tooltip: { ...tooltip, trigger: "item" },
        legend: {
          bottom: 0,
          textStyle: { color: legendText, fontSize: 12 },
        },
        series: [
          {
            name: "Tipo",
            type: "pie",
            radius: ["40%", "68%"],
            center: ["50%", "45%"],
            itemStyle: { borderColor: pieBorder, borderWidth: 2 },
            label: pieLabel,
            labelLine: { lineStyle: { color: pieLine } },
            data: rows.byRecurrence.map(([name, value]) => ({ name, value })),
          },
        ],
      },
    };
  }, [isDark, rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Financeiro
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Dashboard de Despesas
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Análise dos lançamentos de despesas por período, categoria e status.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-2xl bg-surface-soft px-3 text-sm ring-1 ring-app outline-none"
          >
            <option value="all">Todas categorias</option>
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExpenseStatus | "all")}
            className="h-10 rounded-2xl bg-surface-soft px-3 text-sm ring-1 ring-app outline-none"
          >
            <option value="all">Todos status</option>
            <option value="agendada">Agendada</option>
            <option value="a_pagar">A pagar</option>
            <option value="paga">Paga</option>
            <option value="cancelada">Cancelada</option>
          </select>
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
          label="Total"
          value={loading ? "-" : brl.format(metrics.total)}
          detail={`${num.format(items.length)} lançamento(s) no período`}
          accent="green"
          icon={<Banknote className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Em aberto"
          value={loading ? "-" : brl.format(metrics.openTotal)}
          detail="Agendadas e a pagar"
          accent="amber"
          icon={<Clock className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Pagas"
          value={loading ? "-" : brl.format(metrics.paidTotal)}
          detail="Baixadas como pagas"
          accent="blue"
          icon={<CheckCircle2 className="h-4 w-4 text-app-muted" />}
        />
        <StatCard
          label="Ticket médio"
          value={loading ? "-" : brl.format(metrics.average)}
          detail={`Recorrentes: ${brl.format(metrics.recurringTotal)}`}
          accent="green"
          icon={<PieChart className="h-4 w-4 text-app-muted" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Despesas por dia"
          subtitle="Valor lançado por data"
          expandable={{
            option: charts.porDia,
            chartKey: `expenses-day-${range.from}-${range.to}-${items.length}`,
          }}
        >
          <div className="h-[320px]">
            <EChart
              option={charts.porDia}
              height={320}
              chartKey={`expenses-day-${range.from}-${range.to}-${items.length}`}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Despesas por categoria"
          subtitle="Participação por tipo de custo"
          expandable={{
            option: charts.porCategoria,
            chartKey: `expenses-category-${range.from}-${range.to}-${items.length}`,
          }}
        >
          <div className="h-[320px]">
            <EChart
              option={charts.porCategoria}
              height={320}
              chartKey={`expenses-category-${range.from}-${range.to}-${items.length}`}
            />
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Despesas por status"
          subtitle="Aberto, pago, agendado e cancelado"
          expandable={{
            option: charts.porStatus,
            chartKey: `expenses-status-${range.from}-${range.to}-${items.length}`,
          }}
        >
          <div className="h-[300px]">
            <EChart
              option={charts.porStatus}
              height={300}
              chartKey={`expenses-status-${range.from}-${range.to}-${items.length}`}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Top fornecedores"
          subtitle="Maiores saídas no período"
          expandable={{
            option: charts.topFornecedores,
            chartKey: `expenses-suppliers-${range.from}-${range.to}-${items.length}`,
          }}
        >
          <div className="h-[300px]">
            <EChart
              option={charts.topFornecedores}
              height={300}
              chartKey={`expenses-suppliers-${range.from}-${range.to}-${items.length}`}
            />
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ChartCard
          title="Recorrência"
          subtitle="Despesas recorrentes versus avulsas"
          expandable={{
            option: charts.recorrencia,
            chartKey: `expenses-recurring-${range.from}-${range.to}-${items.length}`,
          }}
        >
          <div className="h-[300px]">
            <EChart
              option={charts.recorrencia}
              height={300}
              chartKey={`expenses-recurring-${range.from}-${range.to}-${items.length}`}
            />
          </div>
        </ChartCard>

        <ChartCard title="Próximos vencimentos" subtitle="Contas em aberto ordenadas pelo vencimento">
          <div className="overflow-hidden rounded-2xl ring-1 ring-app">
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                  <tr>
                    <th className="px-4 py-3">Venc.</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app">
                  {rows.nextDue.length ? (
                    rows.nextDue.map((item) => (
                      <tr key={item.id} className="transition hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono">{formatDate(item.dueDate)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-1 text-xs ring-1 ring-app">
                            {statusLabels[item.status] ?? item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.category}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.description}</div>
                          <div className="mt-1 text-xs text-app-soft">{item.supplier ?? "Fornecedor não informado"}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {brl.format(item.amountBRL)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-app-soft">
                        Nenhuma conta em aberto com vencimento no período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ChartCard>
      </section>

      {metrics.canceledTotal > 0 ? (
        <div className="flex items-start gap-3 rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            Existem despesas canceladas no período somando {brl.format(metrics.canceledTotal)}.
          </span>
        </div>
      ) : null}
    </div>
  );
}
