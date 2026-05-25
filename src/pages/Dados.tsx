import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";
import { formatTons } from "@/lib/format";
import { cn } from "@/lib/utils";

type OsRecord = {
  id: string;
  date: string;
  clientName: string;
  embarkPoint: string;
  tons: number;
  rne: number | null;
  status: string | null;
};

type RecordTypeFilter = "all" | "loads" | "rne";

const typeFilterOptions: Array<{ value: RecordTypeFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "loads", label: "Cargas" },
  { value: "rne", label: "RNE" },
];

export default function Dados() {
  const { range, setRange } = useRangeStore();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<RecordTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OsRecord[]>([]);
  const [total, setTotal] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    p.set("type", typeFilter);
    if (q.trim().length) p.set("q", q.trim());
    return p.toString();
  }, [page, pageSize, q, range.from, range.to, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, q, typeFilter]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<{ items: OsRecord[]; total: number }>(`/api/os?${query}`)
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Falha ao carregar");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const exportCsv = async () => {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: range.from,
        to: range.to,
        type: typeFilter,
        q: q.trim() || undefined,
      }),
    });
    if (!res.ok) {
      throw new Error("Falha ao exportar");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${typeFilter}_${range.from}_${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">
            Base de dados
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">OS e Registros</h1>
          <div className="mt-2 text-sm text-white/60">
            {total} registro(s) com movimentação no período
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
            )}
            onClick={() => exportCsv().catch((e) => setError(String(e)))}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-500/20">
          {error}
        </div>
      ) : null}

      <ChartCard
        title="Registros"
        subtitle="Pesquisa por id/cliente/ponto e paginação"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-10 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10">
              {typeFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-xl px-3 text-sm transition",
                    typeFilter === option.value
                      ? "bg-white/10 text-white ring-1 ring-white/10"
                      : "text-white/60 hover:text-white"
                  )}
                  onClick={() => setTypeFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..."
                className={cn(
                  "h-10 w-64 rounded-2xl bg-white/5 pl-10 pr-3 text-sm text-white",
                  "outline-none ring-1 ring-white/10 focus:ring-white/20"
                )}
              />
            </div>
          </div>
        }
      >
        <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
          <div className="overflow-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-black/20 text-xs uppercase tracking-[0.16em] text-white/55">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Ponto</th>
                  <th className="px-4 py-3">Ton</th>
                  <th className="px-4 py-3">RNE</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={7}>
                      Carregando...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((r) => (
                    <tr key={r.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-mono text-white/70">{r.date}</td>
                      <td className="px-4 py-3 font-mono">{r.id}</td>
                      <td className="px-4 py-3">{r.clientName}</td>
                      <td className="px-4 py-3">{r.embarkPoint}</td>
                      <td className="px-4 py-3 font-mono">{formatTons(r.tons)}</td>
                      <td className="px-4 py-3 font-mono">
                        {r.rne == null ? "—" : r.rne}
                      </td>
                      <td className="px-4 py-3 text-white/70">
                        {r.status ?? "—"}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-white/60" colSpan={7}>
                      Sem registros para o período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-white/55">
            Página {page} de {pages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "h-9 rounded-xl px-3 text-sm",
                "bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
              )}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <button
              type="button"
              className={cn(
                "h-9 rounded-xl px-3 text-sm",
                "bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-40"
              )}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
            >
              Próxima
            </button>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
