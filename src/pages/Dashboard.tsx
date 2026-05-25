import { useEffect, useMemo, useState } from "react";
import { BarChart3, DollarSign, Hash, Weight, X } from "lucide-react";
import DateRangePicker from "@/components/DateRangePicker";
import StatCard from "@/components/StatCard";
import ChartCard from "@/components/ChartCard";
import EChart from "@/components/EChart";
import { formatTons, roundTons, rneAxisLabel, tonsAxisLabel } from "@/lib/format";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";

type Stats = {
  kpis: {
    osCount: number;
    tonsTotal: number;
    dailyFeeCount: number;
    tonsDailySeries: Array<{ date: string; tons: number }>;
    tonsMonthlySeries: Array<{ month: string; tons: number }>;
    rneSeries: Array<{ date: string; value: number }>;
    revenueEstimatedBRL: number;
    lastUpdatedAt: string | null;
  };
  breakdowns: {
    byClient: Array<{ clientName: string; tons: number; revenueEstimatedBRL: number }>;
    byEmbarkPoint: Array<{ embarkPoint: string; tons: number; revenueEstimatedBRL: number }>;
  };
};

type OsRecord = {
  id: string;
  osId?: string | null;
  date: string;
  clientName: string;
  embarkPoint: string;
  tons: number;
  rne: number | null;
  status: string | null;
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const num = new Intl.NumberFormat("pt-BR");

const isRneRecord = (item: OsRecord): boolean =>
  item.id.startsWith("RNE-") || item.status === "RNE" || item.rne === 1;

const formatLastUpdatedAt = (value: string | null | undefined): string => {
  if (!value) return "Sem atualização no período";

  const [datePart, timePart = ""] = value.split("T");
  const [year, month, day] = datePart.split("-");
  const [hour = "00", minute = "00"] = timePart.split(":");

  if (!year || !month || !day) return "Sem atualização no período";

  return `${day}/${month}/${year} ${hour}:${minute}`;
};

export default function Dashboard() {
  const { range, setRange } = useRangeStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null);
  const [pointLoads, setPointLoads] = useState<OsRecord[]>([]);
  const [pointLoading, setPointLoading] = useState(false);
  const [pointError, setPointError] = useState<string | null>(null);
  const [selectedRneDate, setSelectedRneDate] = useState<string | null>(null);
  const [rneRecords, setRneRecords] = useState<OsRecord[]>([]);
  const [rneLoading, setRneLoading] = useState(false);
  const [rneError, setRneError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<{ stats: Stats }>(`/api/stats?from=${range.from}&to=${range.to}`)
      .then((r) => {
        if (!alive) return;
        setStats(r.stats);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar");
        setStats(null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const openPointLoads = (point: string) => {
    setSelectedPoint(point);
    setPointLoads([]);
    setPointLoading(true);
    setPointError(null);

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      point,
      page: "1",
      pageSize: "200",
    });

    apiGet<{ items: OsRecord[] }>(`/api/os?${params.toString()}`)
      .then((r) => {
        const loads = r.items.filter((item) => {
          const isSnapshot = item.id.startsWith("OSDAY-");
          return !isRneRecord(item) && !isSnapshot && (item.tons ?? 0) > 0;
        });
        setPointLoads(loads);
      })
      .catch((e: unknown) => {
        setPointError(e instanceof Error ? e.message : "Falha ao carregar cargas");
      })
      .finally(() => setPointLoading(false));
  };

  const handlePointChartClick = (params: unknown) => {
    if (
      typeof params === "object" &&
      params !== null &&
      "name" in params &&
      typeof params.name === "string"
    ) {
      openPointLoads(params.name);
    }
  };

  const openRneRecords = (date: string) => {
    setSelectedRneDate(date);
    setRneRecords([]);
    setRneLoading(true);
    setRneError(null);

    const params = new URLSearchParams({
      from: date,
      to: date,
      page: "1",
      pageSize: "200",
    });

    apiGet<{ items: OsRecord[] }>(`/api/os?${params.toString()}`)
      .then((r) => {
        setRneRecords(r.items.filter(isRneRecord));
      })
      .catch((e: unknown) => {
        setRneError(e instanceof Error ? e.message : "Falha ao carregar RNE");
      })
      .finally(() => setRneLoading(false));
  };

  const handleRneChartClick = (params: unknown) => {
    if (
      typeof params === "object" &&
      params !== null &&
      "name" in params &&
      typeof params.name === "string"
    ) {
      openRneRecords(params.name);
    }
  };

  const charts = useMemo(() => {
    const daily = stats?.kpis.tonsDailySeries ?? [];
    const points = stats?.breakdowns.byEmbarkPoint ?? [];
    const rne = stats?.kpis.rneSeries ?? [];
    const tonsTooltip = {
      trigger: "axis" as const,
      valueFormatter: (value: number) => `${formatTons(value)} t`,
    };

    const dailyValues = daily.map(d => roundTons(d.tons));

    return {
      volumeDiario: {
        backgroundColor: "transparent",
        grid: { left: 48, right: 18, top: 24, bottom: 24 },
        tooltip: tonsTooltip,
        xAxis: {
          type: "category",
          data: daily.map(d => d.date),
          axisLabel: { color: "rgba(255,255,255,0.55)" },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        },
        yAxis: {
          type: "value",
          min: 0,
          axisLabel: {
            color: "rgba(255,255,255,0.55)",
            formatter: tonsAxisLabel,
          },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        },
        series: [
          {
            name: "Toneladas",
            type: "bar",
            barMaxWidth: 56,
            itemStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "#34D399" },
                  { offset: 1, color: "#10B981" },
                ],
              },
              borderRadius: [8, 8, 0, 0],
            },
            emphasis: {
              itemStyle: { color: "#6EE7B7" },
            },
            data: dailyValues,
          },
        ],
      },
      porPonto: {
        backgroundColor: "transparent",
        grid: { left: 140, right: 18, top: 24, bottom: 24 },
        tooltip: { ...tonsTooltip, axisPointer: { type: "shadow" } },
        xAxis: {
          type: "value",
          axisLabel: {
            color: "rgba(255,255,255,0.55)",
            formatter: tonsAxisLabel,
          },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        },
        yAxis: {
          type: "category",
          data: points.slice(0, 12).map((p) => p.embarkPoint),
          axisLabel: { color: "rgba(255,255,255,0.55)" },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        },
        series: [
          {
            name: "Toneladas",
            type: "bar",
            cursor: "pointer",
            barWidth: 14,
            itemStyle: { color: "#F59E0B", borderRadius: [10, 10, 10, 10] },
            data: points.slice(0, 12).map((p) => roundTons(p.tons)),
          },
        ],
      },
      rne: {
        backgroundColor: "transparent",
        grid: { left: 36, right: 18, top: 24, bottom: 24 },
        tooltip: {
          trigger: "axis" as const,
          valueFormatter: (value: number) => `${rneAxisLabel(value)} RNE`,
        },
        xAxis: {
          type: "category",
          data: rne.map(d => d.date),
          axisLabel: { color: "rgba(255,255,255,0.55)" },
          axisLine: { lineStyle: { color: "rgba(255,255,255,0.12)" } },
        },
        yAxis: {
          type: "value",
          min: 0,
          minInterval: 1,
          axisLabel: {
            color: "rgba(255,255,255,0.55)",
            formatter: rneAxisLabel,
          },
          splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
        },
        series: [
          {
            name: "Quantidade de RNE",
            type: "bar",
            cursor: "pointer",
            barMaxWidth: 56,
            itemStyle: {
              color: "#60A5FA",
              borderRadius: [8, 8, 0, 0],
            },
            data: rne.map(d => Math.round(d.value)),
          },
        ],
      },
    };
  }, [stats]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Estatísticas
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Operação e Faturamento
          </h1>
          <div className="mt-2 text-sm text-white/60">
            Período {range.from} → {range.to}
          </div>
          <div className="mt-1 text-sm text-white/55">
            Última atualização: {loading ? "—" : formatLastUpdatedAt(stats?.kpis.lastUpdatedAt)}
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      {error ? (
        <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/20">
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <StatCard
          label="Ordens de Serviço"
          value={loading ? "—" : num.format(stats?.kpis.osCount ?? 0)}
          detail="OS distintas (nº OS) com movimentação no período"
          accent="blue"
          icon={<Hash className="h-4 w-4 text-white/80" />}
        />
        <StatCard
          label="Volume (t)"
          value={loading ? "—" : formatTons(stats?.kpis.tonsTotal ?? 0)}
          detail="Total de toneladas"
          accent="green"
          icon={<Weight className="h-4 w-4 text-white/80" />}
        />
        <StatCard
          label="Diárias"
          value={loading ? "—" : num.format(stats?.kpis.dailyFeeCount ?? 0)}
          detail="OS movimentadas por dia"
          accent="amber"
          icon={<BarChart3 className="h-4 w-4 text-white/80" />}
        />
        <StatCard
          label="Faturamento"
          value={loading ? "—" : brl.format(stats?.kpis.revenueEstimatedBRL ?? 0)}
          detail="Estimativa (regras atuais)"
          accent="green"
          icon={<DollarSign className="h-4 w-4 text-white/80" />}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Volume diário"
          subtitle="Toneladas por dia"
        >
          <div className="h-[340px]">
            <EChart
              option={charts.volumeDiario}
              height={340}
              chartKey={`volume-${range.from}-${range.to}-${stats?.kpis.tonsDailySeries.length ?? 0}`}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Volume por ponto de embarque"
          subtitle="Top pontos (toneladas no período)"
        >
          <div className="h-[340px]">
            <EChart
              option={charts.porPonto}
              height={340}
              onEvents={{ click: handlePointChartClick }}
            />
          </div>
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 gap-4">
        <ChartCard title="RNE" subtitle="Quantidade por dia">
          <div className="h-[320px]">
            <EChart
              option={charts.rne}
              height={320}
              chartKey={`rne-${range.from}-${range.to}-${stats?.kpis.rneSeries.length ?? 0}`}
              onEvents={{ click: handleRneChartClick }}
            />
          </div>
        </ChartCard>
      </section>

      {selectedPoint ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-[980px] overflow-hidden rounded-3xl bg-[#0B0F19] ring-1 ring-white/15">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  Cargas embarcadas
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedPoint}</h2>
                <div className="mt-1 text-sm text-white/55">
                  {range.from} → {range.to}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
                onClick={() => setSelectedPoint(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {pointError ? (
                <div className="m-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/20">
                  {pointError}
                </div>
              ) : pointLoading ? (
                <div className="p-5 text-sm text-white/60">Carregando...</div>
              ) : pointLoads.length ? (
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-white/55">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Carga</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Ton</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pointLoads.map((load) => (
                      <tr key={load.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-white/70">{load.date}</td>
                        <td className="px-4 py-3 font-mono">{load.id}</td>
                        <td className="px-4 py-3 font-mono">{load.osId ?? "—"}</td>
                        <td className="px-4 py-3">{load.clientName}</td>
                        <td className="px-4 py-3 font-mono">{formatTons(load.tons)}</td>
                        <td className="px-4 py-3 text-white/70">{load.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 text-sm text-white/60">
                  Sem cargas para este ponto no período.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedRneDate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-[920px] overflow-hidden rounded-3xl bg-[#0B0F19] ring-1 ring-white/15">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-white/45">
                  RNE lançados
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedRneDate}</h2>
                <div className="mt-1 text-sm text-white/55">
                  OS com RNE nesta data
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
                onClick={() => setSelectedRneDate(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {rneError ? (
                <div className="m-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/20">
                  {rneError}
                </div>
              ) : rneLoading ? (
                <div className="p-5 text-sm text-white/60">Carregando...</div>
              ) : rneRecords.length ? (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-white/55">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Ponto</th>
                      <th className="px-4 py-3">RNE</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {rneRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-white/5">
                        <td className="px-4 py-3 font-mono text-white/70">{record.date}</td>
                        <td className="px-4 py-3 font-mono">{record.osId ?? record.id}</td>
                        <td className="px-4 py-3">{record.clientName}</td>
                        <td className="px-4 py-3">{record.embarkPoint}</td>
                        <td className="px-4 py-3 font-mono">{record.rne ?? 1}</td>
                        <td className="px-4 py-3 text-white/70">{record.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 text-sm text-white/60">
                  Sem RNE para esta data.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
