import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  Download,
  RefreshCw,
  Search,
  UserRoundCheck,
  Weight,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import FitValue from "@/components/FitValue";
import { useToast } from "@/components/ToastProvider";
import { formatRne, formatTons } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";

type WorkedDayClassifierSummary = {
  classifierName: string;
  daysWorked: number;
  volumeDays: number;
  rneDays: number;
  tons: number;
  rneCount: number;
  osCount: number;
  dates: Array<{
    date: string;
    tons: number;
    rneCount: number;
    osCount: number;
    osIds: string[];
    serviceOrders: Array<{
      osId: string;
      farmName: string;
      tons: number;
      rneCount: number;
    }>;
  }>;
};

type WorkedDaysResponse = {
  items: WorkedDayClassifierSummary[];
  totals: {
    classifiers: number;
    daysWorked: number;
    totalClassifierDays: number;
    tons: number;
    rneCount: number;
    osCount: number;
  };
};

const formatDate = (value: string): string => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const inputClass = cn(
  "h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app",
  "outline-none ring-1 ring-app focus:ring-app-strong"
);

const StatTile = ({
  label,
  value,
  detail,
  icon: Icon,
  accent = "emerald",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarCheck;
  accent?: "emerald" | "sky" | "amber";
}) => {
  const accentClass =
    accent === "sky"
      ? "border-l-sky-500"
      : accent === "amber"
        ? "border-l-amber-500"
        : "border-l-emerald-500";

  return (
    <div className={cn("rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app border-l-4", accentClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-app-soft">{label}</div>
          <FitValue className="mt-3" maxRem={1.7} minRem={0.95} mono={false}>
            {value}
          </FitValue>
          <div className="mt-2 text-sm text-app-soft">{detail}</div>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-soft ring-1 ring-app">
          <Icon className="h-5 w-5 text-app-muted" />
        </span>
      </div>
    </div>
  );
};

export default function DiasTrabalhados() {
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const [items, setItems] = useState<WorkedDayClassifierSummary[]>([]);
  const [totals, setTotals] = useState<WorkedDaysResponse["totals"]>({
    classifiers: 0,
    daysWorked: 0,
    totalClassifierDays: 0,
    tons: 0,
    rneCount: 0,
    osCount: 0,
  });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    if (query.trim()) p.set("q", query.trim());
    return p.toString();
  }, [query, range.from, range.to]);

  const load = () => {
    setLoading(true);
    apiGet<WorkedDaysResponse>(`/api/worked-days?${params}`)
      .then((response) => {
        setItems(response.items ?? []);
        setTotals(
          response.totals ?? {
            classifiers: 0,
            daysWorked: 0,
            totalClassifierDays: 0,
            tons: 0,
            rneCount: 0,
            osCount: 0,
          }
        );
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar dias trabalhados");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [params]);

  const runSearch = () => setQuery(q.trim());

  const exportFile = (format: "xlsx" | "pdf") => {
    window.location.href = `/api/worked-days/export/${format}?${params}`;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Produção
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Dias trabalhados
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Dias em que cada classificador movimentou O.S. por volume ou RNE.
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <StatTile
          label="Classificadores"
          value={formatRne(totals.classifiers)}
          detail="Com movimentação no período"
          icon={UserRoundCheck}
          accent="sky"
        />
        <StatTile
          label="Dias com trabalho"
          value={formatRne(totals.daysWorked)}
          detail="Dias únicos no período"
          icon={CalendarCheck}
        />
        <StatTile
          label="Total geral"
          value={formatRne(totals.totalClassifierDays)}
          detail="Soma dos dias de todos"
          icon={CalendarCheck}
          accent="sky"
        />
        <StatTile
          label="Volume"
          value={`${formatTons(totals.tons)} t`}
          detail="Toneladas vinculadas"
          icon={Weight}
        />
        <StatTile
          label="RNE"
          value={formatRne(totals.rneCount)}
          detail="Lançamentos RNE"
          icon={CalendarCheck}
          accent="amber"
        />
      </div>

      <ChartCard
        title="Classificadores"
        subtitle="Ranking por quantidade de dias trabalhados no período."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportFile("xlsx")}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app transition hover:bg-surface-hover"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportFile("pdf")}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app transition hover:bg-surface-hover"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
              aria-label="Atualizar"
              title="Atualizar"
            >
              <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            </button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch();
              }}
              placeholder="Buscar classificador..."
              className={cn(inputClass, "pl-11")}
            />
          </div>
          <button
            type="button"
            onClick={runSearch}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover"
          >
            <Search className="h-4 w-4" />
            Buscar
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl ring-1 ring-app">
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Classificador</th>
                  <th className="px-4 py-3 text-right">Dias</th>
                  <th className="px-4 py-3 text-right">Dias volume</th>
                  <th className="px-4 py-3 text-right">Dias RNE</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">RNE</th>
                  <th className="px-4 py-3 text-right">O.S.</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-app-soft">
                      Carregando...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((item) => {
                    const isOpen = expanded === item.classifierName;
                    return (
                      <Fragment key={item.classifierName}>
                        <tr className="transition hover:bg-surface-hover">
                          <td className="px-4 py-3 font-medium">{item.classifierName}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {formatRne(item.daysWorked)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.volumeDays)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.rneDays)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatTons(item.tons)} t</td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.rneCount)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.osCount)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : item.classifierName)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                              aria-label="Ver dias"
                              title="Ver dias"
                            >
                              <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
                            </button>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="bg-surface-soft/50">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {item.dates.map((date) => (
                                  <div
                                    key={`${item.classifierName}-${date.date}`}
                                    className="rounded-2xl bg-app-panel px-4 py-3 ring-1 ring-app"
                                  >
                                    <div className="font-mono text-sm font-semibold">{formatDate(date.date)}</div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-app-soft">
                                      <span>{formatTons(date.tons)} t</span>
                                      <span>{formatRne(date.rneCount)} RNE</span>
                                      <span>{formatRne(date.osCount)} O.S.</span>
                                    </div>
                                    <div className="mt-3 space-y-1.5">
                                      {date.serviceOrders?.length ? (
                                        date.serviceOrders.map((order) => (
                                          <div
                                            key={`${date.date}-${order.osId}`}
                                            className="rounded-xl bg-surface-soft px-3 py-2 text-xs ring-1 ring-app"
                                          >
                                            <div className="font-mono font-semibold text-app">
                                              {order.osId}
                                            </div>
                                            <div className="mt-1 line-clamp-2 text-app-soft">
                                              {order.farmName || "Fazenda não informada"}
                                            </div>
                                          </div>
                                        ))
                                      ) : date.osIds.length ? (
                                        date.osIds.map((osId) => (
                                          <div
                                            key={`${date.date}-${osId}`}
                                            className="rounded-xl bg-surface-soft px-3 py-2 font-mono text-xs text-app-soft ring-1 ring-app"
                                          >
                                            {osId}
                                          </div>
                                        ))
                                      ) : (
                                        <span className="text-xs text-app-faint">Sem O.S. identificada</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-app-soft">
                      Nenhum classificador com movimentação no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
