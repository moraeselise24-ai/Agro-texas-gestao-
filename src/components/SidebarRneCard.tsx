import { useEffect, useState } from "react";
import { ClipboardX } from "lucide-react";
import FitValue from "@/components/FitValue";
import { formatRne } from "@/lib/format";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";
import { cn } from "@/lib/utils";

type StatsPayload = {
  stats: {
    kpis: {
      rneSeries: Array<{ date: string; value: number }>;
    };
  };
};

const sumRneSeries = (series: Array<{ value: number }>): number =>
  series.reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0);

export default function SidebarRneCard() {
  const { range } = useRangeStore();
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    apiGet<StatsPayload>(`/api/stats?from=${range.from}&to=${range.to}`)
      .then((response) => {
        if (!alive) return;
        setTotal(sumRneSeries(response.stats.kpis.rneSeries ?? []));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setTotal(null);
        setError(e instanceof Error ? e.message : "Falha ao carregar");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  const valueLabel = loading ? "—" : error ? "—" : formatRne(total ?? 0);

  return (
    <div
      className={cn(
        "mt-6 rounded-2xl p-3 ring-1 ring-app",
        "bg-gradient-to-br from-sky-500/15 via-sky-50/80 to-emerald-50/80 dark:via-black/20 dark:to-black/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-app-soft">RNE</div>
          <FitValue className="mt-1 text-app" maxRem={1.5} minRem={0.9}>
            {valueLabel}
          </FitValue>
          <div className="mt-1 text-xs text-app-soft">Quantidade no período</div>
          <div className="mt-2 truncate font-mono text-[11px] text-app-faint">
            {range.from} → {range.to}
          </div>
          {error ? <div className="mt-2 text-xs text-rose-700 dark:text-rose-300/90">{error}</div> : null}
        </div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 ring-1 ring-sky-400/25">
          <ClipboardX className="h-4 w-4 text-sky-700 dark:text-sky-200/90" />
        </div>
      </div>
    </div>
  );
}
