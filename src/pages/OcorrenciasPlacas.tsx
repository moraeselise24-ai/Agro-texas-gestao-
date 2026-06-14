import { useEffect, useMemo, useState } from "react";
import {
  CarFront,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { formatTons } from "@/lib/format";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet } from "@/utils/api";

type PlateOccurrence = {
  id: string;
  osId?: string | null;
  date: string;
  clientName: string;
  embarkPoint: string;
  classifierName?: string | null;
  plate: string | null;
  tons: number;
  rne: number | null;
  status: string | null;
};

type PlateSummary = {
  plates: number;
  occurrences: number;
  osCount: number;
  tons: number;
  rneCount: number;
};

const normalizePlateInput = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export default function OcorrenciasPlacas() {
  const toast = useToast();
  const { range } = useRangeStore();
  const [plate, setPlate] = useState("");
  const [q, setQ] = useState("");
  const [submittedFilters, setSubmittedFilters] = useState<{
    plate: string;
    q: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<PlateOccurrence[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const hasSearched = Boolean(submittedFilters);

  const query = useMemo(() => {
    if (!submittedFilters) return "";
    const params = new URLSearchParams();
    params.set("from", range.from);
    params.set("to", range.to);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("plate", submittedFilters.plate);
    if (submittedFilters.q) params.set("q", submittedFilters.q);
    return params.toString();
  }, [page, pageSize, range.from, range.to, submittedFilters]);

  const exportQuery = useMemo(() => {
    if (!submittedFilters) return "";
    const params = new URLSearchParams();
    params.set("from", range.from);
    params.set("to", range.to);
    params.set("plate", submittedFilters.plate);
    if (submittedFilters.q) params.set("q", submittedFilters.q);
    return params.toString();
  }, [range.from, range.to, submittedFilters]);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, pageSize, submittedFilters]);

  useEffect(() => {
    if (!submittedFilters) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    apiGet<{ items: PlateOccurrence[]; total: number; summary: PlateSummary }>(
      `/api/plate-occurrences?${query}`
    )
      .then((response) => {
        if (!alive) return;
        setItems(response.items ?? []);
        setTotal(response.total ?? 0);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        toast.error(e instanceof Error ? e.message : "Falha ao carregar ocorrências");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [query, submittedFilters, toast]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const exportFile = (format: "xlsx" | "pdf") => {
    if (!submittedFilters) {
      toast.error("Pesquise uma placa antes de exportar.");
      return;
    }
    window.location.href = `/api/plate-occurrences/export/${format}?${exportQuery}`;
  };

  const handleSearch = () => {
    const cleanPlate = plate.trim();
    if (!cleanPlate) {
      toast.error("Digite uma placa para pesquisar.");
      return;
    }
    setPage(1);
    setSubmittedFilters({ plate: cleanPlate, q: q.trim() });
  };

  const clearSearch = () => {
    setPlate("");
    setQ("");
    setSubmittedFilters(null);
    setPage(1);
    setItems([]);
    setTotal(0);
  };

  const downloadLaudoPdf = async (item: PlateOccurrence) => {
    setPdfLoadingId(item.id);
    try {
      const params = new URLSearchParams();
      if (item.plate) params.set("plate", item.plate);
      if (item.osId) params.set("osId", item.osId);
      const response = await fetch(`/api/plate-occurrences/laudos/${encodeURIComponent(item.id)}/pdf?${params}`);
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error ?? "Falha ao gerar PDF do laudo");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `laudo-${item.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF do laudo");
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Relatórios
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Ocorrências de placas
          </h1>
          <div className="mt-2 max-w-2xl text-sm text-app-soft">
            Pesquise placas, veja em quais O.S. apareceram e exporte o relatório.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportFile("xlsx")}
            disabled={!hasSearched}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportFile("pdf")}
            disabled={!hasSearched}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <FileText className="h-4 w-4 text-rose-400" />
            PDF
          </button>
        </div>
      </header>

      <ChartCard
        title="Consulta"
        subtitle="Filtre por placa ou termos da O.S."
        actions={
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex h-9 items-center rounded-xl bg-surface-soft px-3 text-xs text-app-muted ring-1 ring-app transition hover:bg-surface-hover"
          >
            Limpar
          </button>
        }
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_170px_auto]">
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-app-faint">
              Placa
            </span>
            <div className="relative">
              <CarFront className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
              <input
                value={plate}
                onChange={(e) => setPlate(normalizePlateInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Ex.: ABC1D23"
                className="h-11 w-full rounded-2xl bg-surface-soft pl-10 pr-3 font-mono text-sm uppercase tracking-[0.12em] text-app outline-none ring-1 ring-app focus:ring-app-strong"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-app-faint">
              Busca geral
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder="Cliente, O.S., fazenda, classificador..."
                className="h-11 w-full rounded-2xl bg-surface-soft pl-10 pr-3 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-app-faint">
              Página
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-11 rounded-2xl bg-surface-soft px-3 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-medium text-white shadow-app transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Pesquisar
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-app">
          <div className="overflow-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">O.S.</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Fazenda/Ponto</th>
                  <th className="px-4 py-3">Classificador</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3 text-right">RNE</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Laudo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {loading ? (
                  <tr>
                    <td className="px-4 py-8 text-app-soft" colSpan={10}>
                      Carregando ocorrências...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-mono text-app-muted">{item.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-xl bg-surface-soft px-3 py-1 font-mono text-xs tracking-[0.12em] ring-1 ring-app">
                          {item.plate ?? "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{item.osId ?? item.id}</td>
                      <td className="px-4 py-3">{item.clientName}</td>
                      <td className="px-4 py-3">{item.embarkPoint}</td>
                      <td className="px-4 py-3 text-app-muted">{item.classifierName ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatTons(item.tons)} t</td>
                      <td className="px-4 py-3 text-right font-mono">{item.rne ?? "-"}</td>
                      <td className="px-4 py-3 text-app-muted">{item.status ?? "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => downloadLaudoPdf(item)}
                          disabled={pdfLoadingId === item.id}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-xs ring-1 ring-app transition hover:bg-surface-hover disabled:cursor-wait disabled:opacity-60"
                          title="Baixar PDF do laudo no Classific"
                        >
                          {pdfLoadingId === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-app-muted" />
                          ) : (
                            <FileText className="h-4 w-4 text-rose-400" />
                          )}
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-14 text-center text-app-soft" colSpan={10}>
                      {hasSearched
                        ? "Nenhuma ocorrência encontrada para a placa pesquisada."
                        : "Digite uma placa e clique em Pesquisar para gerar a listagem."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-app-soft">
            {hasSearched ? `${total} ocorrência(s) · página ${page} de ${pages}` : "Aguardando pesquisa por placa"}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "h-9 rounded-xl px-3 text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
              )}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
            >
              Anterior
            </button>
            <button
              type="button"
              className={cn(
                "h-9 rounded-xl px-3 text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
              )}
              onClick={() => setPage((value) => Math.min(pages, value + 1))}
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
