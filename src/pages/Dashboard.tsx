import { useEffect, useMemo, useState } from "react";
import { BarChart3, ClipboardX, DollarSign, Hash, PackageCheck, RefreshCw, Scale, Weight, X } from "lucide-react";
import DateRangePicker from "@/components/DateRangePicker";
import StatCard from "@/components/StatCard";
import ChartCard from "@/components/ChartCard";
import EChart from "@/components/EChart";
import { useToast } from "@/components/ToastProvider";
import { formatTons, roundTons, rneAxisLabel, tonsAxisLabel } from "@/lib/format";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet, apiJson } from "@/utils/api";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/useAuthStore";

type Stats = {
  kpis: {
    osCount: number;
    tonsTotal: number;
    dailyFeeCount: number;
    tonsDailySeries: Array<{ date: string; tons: number }>;
    dailyFeeSeries: Array<{ date: string; value: number }>;
    revenueDailySeries: Array<{ date: string; value: number }>;
    tonsMonthlySeries: Array<{ month: string; tons: number }>;
    rneSeries: Array<{ date: string; value: number }>;
    revenueEstimatedBRL: number;
    lastUpdatedAt: string | null;
    loadCount: number;
    avgTonsPerOs: number;
    avgTonsPerDay: number;
  };
  breakdowns: {
    byClient: Array<{ clientName: string; tons: number; revenueEstimatedBRL: number }>;
    byEmbarkPoint: Array<{ embarkPoint: string; tons: number; revenueEstimatedBRL: number }>;
    byClassifier: Array<{ classifierName: string; tons: number }>;
    byOs: Array<{ osId: string; clientName: string; embarkPoint: string; tons: number }>;
  };
};

type OsRecord = {
  id: string;
  osId?: string | null;
  date: string;
  clientName: string;
  embarkPoint: string;
  plate: string | null;
  tons: number;
  rne: number | null;
  status: string | null;
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
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const { isDark } = useTheme();
  const canAccessDashboard = useAuthStore((s) => s.canAccessDashboard);
  const canAccessFaturamento = useAuthStore((s) => s.canAccessFaturamento);
  const [activeTab, setActiveTab] = useState<"operacao" | "faturamento">(
    canAccessDashboard ? "operacao" : "faturamento"
  );
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
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
    if (activeTab === "operacao" && !canAccessDashboard && canAccessFaturamento) {
      setActiveTab("faturamento");
    }
    if (activeTab === "faturamento" && !canAccessFaturamento && canAccessDashboard) {
      setActiveTab("operacao");
    }
  }, [activeTab, canAccessDashboard, canAccessFaturamento]);

  const runSync = async () => {
    setSyncLoading(true);
    try {
      await apiJson("/api/sync/run", { method: "POST" });
      toast.success("Sincronização concluída.");
      const r = await apiGet<{ stats: Stats }>(`/api/stats?from=${range.from}&to=${range.to}`);
      setStats(r.stats);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<{ stats: Stats }>(`/api/stats?from=${range.from}&to=${range.to}`)
      .then((r) => {
        if (!alive) return;
        setStats(r.stats);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        toast.error(e instanceof Error ? e.message : "Falha ao carregar");
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
    const axisColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(23,33,27,0.58)";
    const axisLineColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(22,101,52,0.16)";
    const splitLineColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(22,101,52,0.1)";
    const tooltipBg = isDark ? "rgba(11,15,25,0.92)" : "rgba(255,255,255,0.96)";
    const tooltipText = isDark ? "rgba(255,255,255,0.88)" : "rgba(23,33,27,0.86)";
    const legendText = isDark ? "rgba(255,255,255,0.62)" : "rgba(23,33,27,0.66)";
    const pieCenterText = isDark ? "rgba(255,255,255,0.82)" : "rgba(23,33,27,0.84)";
    const pieLabel = isDark ? "rgba(255,255,255,0.74)" : "rgba(23,33,27,0.72)";
    const pieLabelStrong = isDark ? "rgba(255,255,255,0.86)" : "rgba(23,33,27,0.86)";
    const pieLine = isDark ? "rgba(255,255,255,0.32)" : "rgba(22,101,52,0.28)";
    const pieBorder = isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.75)";

    const daily = stats?.kpis.tonsDailySeries ?? [];
    const dailyFees = stats?.kpis.dailyFeeSeries ?? [];
    const dailyRevenue = stats?.kpis.revenueDailySeries ?? [];
    const points = stats?.breakdowns.byEmbarkPoint ?? [];
    const clients = stats?.breakdowns.byClient ?? [];
    const classifiers = stats?.breakdowns.byClassifier ?? [];
    const rne = stats?.kpis.rneSeries ?? [];
    const tonsTooltip = {
      trigger: "axis" as const,
      valueFormatter: (value: number) => `${formatTons(value)} t`,
    };
    const brlTooltip = {
      trigger: "axis" as const,
      valueFormatter: (value: number) => brl.format(value),
    };

    const dailyValues = daily.map(d => roundTons(d.tons));
    const clientRevenue = clients
      .slice()
      .sort((a, b) => b.revenueEstimatedBRL - a.revenueEstimatedBRL)
      .slice(0, 12);
    const topClientVolumeData = clients
      .slice()
      .sort((a, b) => b.tons - a.tons)
      .slice(0, 12);
    const buildPointChart = (
      source: Array<{ embarkPoint: string; tons: number }>,
      expanded = false,
    ) => ({
      backgroundColor: "transparent",
      grid: {
        left: expanded ? 280 : 220,
        right: 24,
        top: 24,
        bottom: 24,
        containLabel: false,
      },
      tooltip: { ...tonsTooltip, axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        axisLabel: {
          color: axisColor,
          formatter: tonsAxisLabel,
        },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: "category",
        data: source.map((p) => p.embarkPoint),
        axisLabel: {
          color: axisColor,
          width: expanded ? 260 : 200,
          overflow: "truncate",
          ellipsis: "…",
        },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      series: [
        {
          name: "Toneladas",
          type: "bar",
          cursor: "pointer",
          barWidth: expanded ? 10 : 14,
          itemStyle: { color: "#F59E0B", borderRadius: [10, 10, 10, 10] },
          data: source.map((p) => roundTons(p.tons)),
        },
      ],
    });
    const buildClassifierChart = (
      source: Array<{ classifierName: string; tons: number }>,
      expanded = false,
    ) => ({
      backgroundColor: "transparent",
      title: source.length
        ? undefined
        : {
            text: "Sem dados de classificador no período",
            subtext: "Rode uma nova coleta para gravar o classificador dos laudos.",
            left: "center",
            top: "middle",
            textStyle: { color: axisColor, fontSize: 14, fontWeight: 600 },
            subtextStyle: { color: axisColor, fontSize: 12 },
          },
      grid: { left: expanded ? 240 : 190, right: 24, top: 24, bottom: 24 },
      tooltip: { ...tonsTooltip, axisPointer: { type: "shadow" } },
      xAxis: {
        type: "value",
        axisLabel: {
          color: axisColor,
          formatter: tonsAxisLabel,
        },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: "category",
        data: source.map((c) => c.classifierName),
        axisLabel: {
          color: axisColor,
          width: expanded ? 220 : 170,
          overflow: "truncate",
          ellipsis: "…",
        },
        axisTick: { alignWithLabel: true },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      series: [
        {
          name: "Toneladas",
          type: "bar",
          barWidth: expanded ? 10 : 14,
          itemStyle: { color: "#34D399", borderRadius: [10, 10, 10, 10] },
          data: source.map((c) => roundTons(c.tons)),
        },
      ],
    });

    return {
      volumeDiario: {
        backgroundColor: "transparent",
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: tonsTooltip,
        xAxis: {
          type: "category",
          data: daily.map(d => d.date),
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          min: 0,
          axisLabel: {
            color: axisColor,
            formatter: tonsAxisLabel,
          },
          splitLine: { lineStyle: { color: splitLineColor } },
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
      faturamentoDiario: {
        backgroundColor: "transparent",
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: {
          ...brlTooltip,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
        },
        xAxis: {
          type: "category",
          data: dailyRevenue.map((d) => d.date),
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          min: 0,
          axisLabel: {
            color: axisColor,
            formatter: (value: number | string) => brlCompact.format(Number(value)),
          },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "Faturamento",
            type: "line",
            smooth: true,
            showSymbol: false,
            symbolSize: 7,
            lineStyle: { width: 3, color: "#34D399" },
            itemStyle: { color: "#6EE7B7" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(52, 211, 153, 0.22)" },
                  { offset: 1, color: "rgba(52, 211, 153, 0.02)" },
                ],
              },
            },
            emphasis: { focus: "series", itemStyle: { color: "#A7F3D0" } },
            data: dailyRevenue.map((d) => Math.round(d.value * 100) / 100),
          },
        ],
      },
      diariasPorDia: {
        backgroundColor: "transparent",
        grid: { left: 12, right: 18, top: 24, bottom: 24, containLabel: true },
        tooltip: {
          trigger: "axis" as const,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
          valueFormatter: (value: number) => `${rneAxisLabel(value)} diária(s)`,
        },
        xAxis: {
          type: "category",
          data: dailyFees.map((d) => d.date),
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          min: 0,
          minInterval: 1,
          axisLabel: {
            color: axisColor,
            formatter: rneAxisLabel,
          },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "Diárias",
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 7,
            showSymbol: false,
            lineStyle: { width: 3, color: "#FBBF24" },
            itemStyle: { color: "#FCD34D" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(251, 191, 36, 0.18)" },
                  { offset: 1, color: "rgba(251, 191, 36, 0.015)" },
                ],
              },
            },
            emphasis: { focus: "series", itemStyle: { color: "#FDE68A" } },
            data: dailyFees.map((d) => Math.round(d.value)),
          },
        ],
      },
      porPonto: buildPointChart(points.slice(0, 12)),
      porPontoExpandido: buildPointChart(points, true),
      producaoClassificador: buildClassifierChart(classifiers.slice(0, 12)),
      producaoClassificadorExpandido: buildClassifierChart(classifiers, true),
      topOsVolume: {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item" as const,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
          formatter: (params: {
            name?: string;
            value?: number;
            data?: { clientName?: string };
          }) => {
            const details = [
              `<strong>${params.name ?? "Cliente"}</strong>`,
              `${formatTons(Number(params.value ?? 0))} t`,
            ].filter(Boolean);
            return details.join("<br/>");
          },
        },
        legend: {
          type: "scroll",
          orient: "vertical",
          right: 8,
          top: 20,
          bottom: 20,
          width: 150,
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 12,
          textStyle: {
            color: legendText,
            width: 120,
            overflow: "truncate",
            ellipsis: "…",
          },
          pageIconColor: legendText,
          pageIconInactiveColor: pieLine,
          pageTextStyle: { color: axisColor },
        },
        color: [
          "#2DD4BF",
          "#34D399",
          "#60A5FA",
          "#F59E0B",
          "#A78BFA",
          "#F472B6",
          "#FBBF24",
          "#93C5FD",
          "#86EFAC",
          "#FDBA74",
          "#67E8F9",
          "#C4B5FD",
        ],
        graphic: {
          type: "text",
          left: "30%",
          top: "center",
          style: {
            text: `${formatTons(
              topClientVolumeData.reduce((sum, item) => sum + item.tons, 0)
            )} t`,
            textAlign: "center",
            fill: pieCenterText,
            fontSize: 15,
            fontWeight: 600,
          },
        },
        series: [
          {
            name: "Toneladas",
            type: "pie",
            radius: ["48%", "70%"],
            center: ["32%", "50%"],
            avoidLabelOverlap: true,
            minAngle: 5,
            itemStyle: {
              borderColor: pieBorder,
              borderWidth: 1,
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.16)",
            },
            label: {
              show: true,
              color: pieLabel,
              fontSize: 12,
              formatter: ({ name, percent }: { name?: string; percent?: number }) => {
                if (percent == null) return "";
                const label = String(name ?? "");
                const shortLabel =
                  label.length > 14 ? `${label.slice(0, 14).trim()}…` : label;
                return `${shortLabel}\n${percent.toFixed(1)}%`;
              },
            },
            labelLine: {
              show: true,
              length: 12,
              length2: 8,
              smooth: true,
              lineStyle: { color: pieLine },
            },
            emphasis: {
              scaleSize: 6,
              label: {
                show: true,
                color: pieLabelStrong,
                formatter: ({ name, percent }: { name?: string; percent?: number }) =>
                  percent == null ? "" : `${name ?? ""}\n${percent.toFixed(1)}%`,
              },
            },
            data: topClientVolumeData.map((item) => ({
              name: item.clientName,
              value: roundTons(item.tons),
            })),
          },
        ],
      },
      clientesFaturamento: {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "item" as const,
          backgroundColor: tooltipBg,
          borderColor: axisLineColor,
          textStyle: { color: tooltipText },
          valueFormatter: (value: number) => brl.format(value),
        },
        legend: {
          type: "scroll",
          orient: "vertical",
          right: 8,
          top: 20,
          bottom: 20,
          width: 210,
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 12,
          textStyle: {
            color: legendText,
            width: 180,
            overflow: "truncate",
            ellipsis: "…",
          },
          pageIconColor: legendText,
          pageIconInactiveColor: pieLine,
          pageTextStyle: { color: axisColor },
          formatter: (name: string) =>
            name.length > 28 ? `${name.slice(0, 28).trim()}…` : name,
        },
        color: [
          "#34D399",
          "#F59E0B",
          "#60A5FA",
          "#A78BFA",
          "#F472B6",
          "#2DD4BF",
          "#FBBF24",
          "#93C5FD",
          "#86EFAC",
          "#FDBA74",
          "#C4B5FD",
          "#67E8F9",
        ],
        graphic: {
          type: "text",
          left: "27%",
          top: "center",
          style: {
            text: brlCompact.format(
              clientRevenue.reduce((sum, c) => sum + c.revenueEstimatedBRL, 0),
            ),
            textAlign: "center",
            fill: pieCenterText,
            fontSize: 18,
            fontWeight: 600,
          },
        },
        series: [
          {
            name: "Faturamento",
            type: "pie",
            radius: ["52%", "72%"],
            center: ["30%", "50%"],
            avoidLabelOverlap: true,
            minAngle: 4,
            itemStyle: {
              borderColor: pieBorder,
              borderWidth: 1,
              shadowBlur: 10,
              shadowColor: "rgba(0,0,0,0.16)",
            },
            label: {
              show: true,
              color: pieLabel,
              fontSize: 12,
              formatter: ({ name, percent }: { name?: string; percent?: number }) => {
                if (percent == null) return "";
                const label = (name ?? "").split(",")[0].trim();
                const shortLabel = label.length > 18 ? `${label.slice(0, 18).trim()}…` : label;
                return `${shortLabel}\n${percent.toFixed(1)}%`;
              },
            },
            labelLine: {
              show: true,
              length: 14,
              length2: 10,
              smooth: true,
              lineStyle: { color: pieLine },
            },
            emphasis: {
              scaleSize: 6,
              label: {
                show: true,
                color: pieLabelStrong,
                formatter: ({ name, percent }: { name?: string; percent?: number }) =>
                  percent == null ? "" : `${(name ?? "").split(",")[0]}\n${percent.toFixed(1)}%`,
              },
            },
            data: clientRevenue.map((c) => ({
              name: c.clientName,
              value: Math.round(c.revenueEstimatedBRL * 100) / 100,
            })),
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
          axisLabel: { color: axisColor },
          axisLine: { lineStyle: { color: axisLineColor } },
        },
        yAxis: {
          type: "value",
          min: 0,
          minInterval: 1,
          axisLabel: {
            color: axisColor,
            formatter: rneAxisLabel,
          },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        series: [
          {
            name: "Quantidade de RNE",
            type: "line",
            cursor: "pointer",
            smooth: true,
            symbol: "circle",
            symbolSize: 9,
            showSymbol: true,
            lineStyle: {
              width: 3,
              color: "#60A5FA",
            },
            itemStyle: { color: "#93C5FD" },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(96,165,250,0.28)" },
                  { offset: 1, color: "rgba(96,165,250,0.02)" },
                ],
              },
            },
            emphasis: { focus: "series", itemStyle: { color: "#DBEAFE" } },
            data: rne.map(d => Math.round(d.value)),
          },
        ],
      },
    };
  }, [isDark, stats]);

  const rneTotal = useMemo(
    () =>
      (stats?.kpis.rneSeries ?? []).reduce((sum, point) => {
        const value = Number(point.value ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [stats?.kpis.rneSeries]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Estatísticas
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Operação e Faturamento
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Período {range.from} → {range.to}
          </div>
          <div className="mt-1 text-sm text-app-soft">
            Última atualização: {loading ? "—" : formatLastUpdatedAt(stats?.kpis.lastUpdatedAt)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            disabled={syncLoading}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
              "disabled:opacity-40"
            )}
            onClick={() => runSync().catch(() => undefined)}
          >
            <RefreshCw className={cn("h-4 w-4", syncLoading ? "animate-spin" : "")} />
            {syncLoading ? "Sincronizando..." : "Sincronizar agora"}
          </button>
        </div>
      </header>

      <div className="inline-flex rounded-2xl bg-surface-soft p-1 ring-1 ring-app">
        {canAccessDashboard ? (
          <button
          type="button"
          onClick={() => setActiveTab("operacao")}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm transition",
            activeTab === "operacao"
              ? "bg-surface-active text-app shadow-sm ring-1 ring-app"
              : "text-app-muted hover:bg-surface-hover hover:text-app"
          )}
        >
          <Weight className="h-4 w-4" />
          Operação
        </button>
        ) : null}
        {canAccessFaturamento ? (
        <button
          type="button"
          onClick={() => setActiveTab("faturamento")}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm transition",
            activeTab === "faturamento"
              ? "bg-surface-active text-app shadow-sm ring-1 ring-app"
              : "text-app-muted hover:bg-surface-hover hover:text-app"
          )}
        >
          <DollarSign className="h-4 w-4" />
          Faturamento
        </button>
        ) : null}
      </div>

      {activeTab === "operacao" ? (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <StatCard
              label="Ordens de Serviço"
              value={loading ? "—" : num.format(stats?.kpis.osCount ?? 0)}
              detail="OS distintas (nº OS) com movimentação no período"
              accent="blue"
              icon={<Hash className="h-4 w-4 text-app-muted" />}
            />
            <StatCard
              label="Volume (t)"
              value={loading ? "—" : formatTons(stats?.kpis.tonsTotal ?? 0)}
              detail="Total de toneladas"
              accent="green"
              icon={<Weight className="h-4 w-4 text-app-muted" />}
            />
            <StatCard
              label="RNE"
              value={loading ? "—" : num.format(rneTotal)}
              detail="Quantidade no período"
              accent="blue"
              icon={<ClipboardX className="h-4 w-4 text-app-muted" />}
            />
            <StatCard
              label="Laudos"
              value={loading ? "—" : num.format(stats?.kpis.loadCount ?? 0)}
              detail="Cargas/laudos com volume"
              accent="blue"
              icon={<PackageCheck className="h-4 w-4 text-app-muted" />}
            />
            <StatCard
              label="Média por OS"
              value={loading ? "—" : formatTons(stats?.kpis.avgTonsPerOs ?? 0)}
              detail="Toneladas por OS"
              accent="green"
              icon={<Scale className="h-4 w-4 text-app-muted" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Volume diário"
              subtitle="Toneladas por dia"
              expandable={{
                option: charts.volumeDiario,
                chartKey: `volume-${range.from}-${range.to}-${stats?.kpis.tonsDailySeries.length ?? 0}`,
              }}
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
              expandable={{
                option: charts.porPontoExpandido,
                onEvents: { click: handlePointChartClick },
              }}
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
            <ChartCard
              title="RNE"
              subtitle="Quantidade por dia"
              expandable={{
                option: charts.rne,
                chartKey: `rne-${range.from}-${range.to}-${stats?.kpis.rneSeries.length ?? 0}`,
                onEvents: { click: handleRneChartClick },
              }}
            >
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

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Produção por classificador"
              subtitle="Toneladas somadas dos laudos emitidos"
              expandable={{
                option: charts.producaoClassificadorExpandido,
                chartKey: `classifier-production-${range.from}-${range.to}-${stats?.breakdowns.byClassifier?.length ?? 0}`,
              }}
            >
              <div className="h-[340px]">
                <EChart
                  option={charts.producaoClassificador}
                  height={340}
                  chartKey={`classifier-production-${range.from}-${range.to}-${stats?.breakdowns.byClassifier?.length ?? 0}`}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Volume por cliente"
              subtitle="Clientes com maior tonelagem no período"
              expandable={{
                option: charts.topOsVolume,
                chartKey: `top-client-volume-${range.from}-${range.to}-${stats?.breakdowns.byClient?.length ?? 0}`,
              }}
            >
              <div className="h-[340px]">
                <EChart
                  option={charts.topOsVolume}
                  height={340}
                  chartKey={`top-client-volume-${range.from}-${range.to}-${stats?.breakdowns.byClient?.length ?? 0}`}
                />
              </div>
            </ChartCard>
          </section>
        </>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <StatCard
              label="Diárias"
              value={loading ? "—" : num.format(stats?.kpis.dailyFeeCount ?? 0)}
              detail="OS movimentadas por dia"
              accent="amber"
              icon={<BarChart3 className="h-4 w-4 text-app-muted" />}
            />
            <StatCard
              label="Faturamento"
              value={loading ? "—" : brl.format(stats?.kpis.revenueEstimatedBRL ?? 0)}
              detail="Estimativa (regras atuais)"
              accent="green"
              icon={<DollarSign className="h-4 w-4 text-app-muted" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Faturamento diário"
              subtitle="Receita estimada por dia"
              expandable={{
                option: charts.faturamentoDiario,
                chartKey: `revenue-${range.from}-${range.to}-${stats?.kpis.revenueDailySeries?.length ?? 0}`,
              }}
            >
              <div className="h-[320px]">
                <EChart
                  option={charts.faturamentoDiario}
                  height={320}
                  chartKey={`revenue-${range.from}-${range.to}-${stats?.kpis.revenueDailySeries?.length ?? 0}`}
                />
              </div>
            </ChartCard>

            <ChartCard
              title="Diárias por dia"
              subtitle="OS movimentadas e RNE cobrados por data"
              expandable={{
                option: charts.diariasPorDia,
                chartKey: `daily-fees-${range.from}-${range.to}-${stats?.kpis.dailyFeeSeries?.length ?? 0}`,
              }}
            >
              <div className="h-[320px]">
                <EChart
                  option={charts.diariasPorDia}
                  height={320}
                  chartKey={`daily-fees-${range.from}-${range.to}-${stats?.kpis.dailyFeeSeries?.length ?? 0}`}
                />
              </div>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-4">
            <ChartCard
              title="Top clientes por faturamento"
              subtitle="Receita estimada no período"
              expandable={{
                option: charts.clientesFaturamento,
                chartKey: `clients-revenue-${range.from}-${range.to}-${stats?.breakdowns.byClient.length ?? 0}`,
              }}
            >
              <div className="h-[360px]">
                <EChart
                  option={charts.clientesFaturamento}
                  height={360}
                  chartKey={`clients-revenue-${range.from}-${range.to}-${stats?.breakdowns.byClient.length ?? 0}`}
                />
              </div>
            </ChartCard>
          </section>
        </>
      )}

      {selectedPoint ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="w-full max-w-[980px] overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Cargas embarcadas
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedPoint}</h2>
                <div className="mt-1 text-sm text-app-soft">
                  {range.from} → {range.to}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setSelectedPoint(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {pointError ? (
                <div className="m-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/20">
                  {pointError}
                </div>
              ) : pointLoading ? (
                <div className="p-5 text-sm text-app-soft">Carregando...</div>
              ) : pointLoads.length ? (
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Carga</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Placa</th>
                      <th className="px-4 py-3">Ton</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {pointLoads.map((load) => (
                      <tr key={load.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-app-muted">{load.date}</td>
                        <td className="px-4 py-3 font-mono">{load.id}</td>
                        <td className="px-4 py-3 font-mono">{load.osId ?? "—"}</td>
                        <td className="px-4 py-3">{load.clientName}</td>
                        <td className="px-4 py-3 font-mono text-app-muted">{load.plate ?? "—"}</td>
                        <td className="px-4 py-3 font-mono">{formatTons(load.tons)}</td>
                        <td className="px-4 py-3 text-app-muted">{load.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 text-sm text-app-soft">
                  Sem cargas para este ponto no período.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {selectedRneDate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="w-full max-w-[920px] overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  RNE lançados
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedRneDate}</h2>
                <div className="mt-1 text-sm text-app-soft">
                  OS com RNE nesta data
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setSelectedRneDate(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              {rneError ? (
                <div className="m-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/20">
                  {rneError}
                </div>
              ) : rneLoading ? (
                <div className="p-5 text-sm text-app-soft">Carregando...</div>
              ) : rneRecords.length ? (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                    <tr>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Ponto</th>
                      <th className="px-4 py-3">RNE</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app">
                    {rneRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-app-muted">{record.date}</td>
                        <td className="px-4 py-3 font-mono">{record.osId ?? record.id}</td>
                        <td className="px-4 py-3">{record.clientName}</td>
                        <td className="px-4 py-3">{record.embarkPoint}</td>
                        <td className="px-4 py-3 font-mono">{record.rne ?? 1}</td>
                        <td className="px-4 py-3 text-app-muted">{record.status ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 text-sm text-app-soft">
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
