import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Search, X } from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import FitValue from "@/components/FitValue";
import { useToast } from "@/components/ToastProvider";
import { useRangeStore } from "@/stores/useRangeStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { apiGet } from "@/utils/api";
import { formatTons } from "@/lib/format";
import { cn } from "@/lib/utils";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

type OsRecord = {
  id: string;
  osId?: string | null;
  contractNumber?: string | null;
  date: string;
  clientName: string;
  embarkPoint: string;
  plate: string | null;
  tons: number;
  rne: number | null;
  status: string | null;
};

type OsDetail = {
  osId: string;
  clientName: string | null;
  embarkPoint: string | null;
  tonsTotal: number;
  rneCount: number;
  revenueEstimatedBRL: number;
  dailyFeeCount: number;
  records: OsRecord[];
};

type RecordTypeFilter = "all" | "loads" | "rne";
type SortMode = "date" | "contract";

const typeFilterOptions: Array<{ value: RecordTypeFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "loads", label: "Cargas" },
  { value: "rne", label: "RNE" },
];

export default function Dados() {
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const canAccessFaturamento = useAuthStore((state) => state.canAccessFaturamento);
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [contract, setContract] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [typeFilter, setTypeFilter] = useState<RecordTypeFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [volume, setVolume] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [volumeLoading, setVolumeLoading] = useState(false);
  const [clients, setClients] = useState<string[]>([]);
  const [contracts, setContracts] = useState<string[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [selectedOs, setSelectedOs] = useState<OsDetail | null>(null);
  const [selectedOsLoading, setSelectedOsLoading] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    p.set("type", typeFilter);
    p.set("sort", sortMode);
    if (q.trim().length) p.set("q", q.trim());
    if (client.trim().length) p.set("client", client.trim());
    if (contract.trim().length) p.set("contract", contract.trim());
    return p.toString();
  }, [client, contract, page, pageSize, q, range.from, range.to, sortMode, typeFilter]);

  const clientsQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    p.set("type", typeFilter);
    return p.toString();
  }, [range.from, range.to, typeFilter]);

  const contractsQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    p.set("type", typeFilter);
    if (q.trim().length) p.set("q", q.trim());
    if (client.trim().length) p.set("client", client.trim());
    return p.toString();
  }, [client, q, range.from, range.to, typeFilter]);

  const statsQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    p.set("type", typeFilter);
    if (q.trim().length) p.set("q", q.trim());
    if (client.trim().length) p.set("client", client.trim());
    if (contract.trim().length) p.set("contract", contract.trim());
    return p.toString();
  }, [client, contract, q, range.from, range.to, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [range.from, range.to, q, typeFilter, client, contract, sortMode]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<{ items: OsRecord[]; total: number }>(`/api/os?${query}`)
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        toast.error(e instanceof Error ? e.message : "Falha ao carregar");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    let alive = true;
    setClientsLoading(true);
    apiGet<{ clients: string[] }>(`/api/clients?${clientsQuery}`)
      .then((r) => {
        if (!alive) return;
        setClients(r.clients ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setClients([]);
      })
      .finally(() => {
        if (!alive) return;
        setClientsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [clientsQuery]);


  useEffect(() => {
    let alive = true;
    setContractsLoading(true);
    apiGet<{ contracts: string[] }>(`/api/os/contracts?${contractsQuery}`)
      .then((r) => {
        if (!alive) return;
        setContracts(r.contracts ?? []);
      })
      .catch(() => {
        if (!alive) return;
        setContracts([]);
      })
      .finally(() => {
        if (!alive) return;
        setContractsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [contractsQuery]);

  useEffect(() => {
    let alive = true;
    setVolumeLoading(true);
    apiGet<{ stats: { kpis: { tonsTotal: number; revenueEstimatedBRL: number } } }>(
      `/api/stats?${statsQuery}`
    )
      .then((r) => {
        if (!alive) return;
        setVolume(r.stats.kpis.tonsTotal ?? 0);
        setRevenue(canAccessFaturamento ? r.stats.kpis.revenueEstimatedBRL ?? 0 : null);
      })
      .catch(() => {
        if (!alive) return;
        setVolume(null);
        setRevenue(null);
      })
      .finally(() => {
        if (!alive) return;
        setVolumeLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [canAccessFaturamento, statsQuery]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const clientOptions = useMemo(() => {
    const current = client.trim();
    if (!current) return clients;
    if (clients.includes(current)) return clients;
    return [current, ...clients];
  }, [client, clients]);

  const contractOptions = useMemo(() => {
    const current = contract.trim();
    if (!current) return contracts;
    if (contracts.includes(current)) return contracts;
    return [current, ...contracts];
  }, [contract, contracts]);

  const exportFile = async (format: "csv" | "xlsx" | "pdf") => {
    const endpoint = format === "csv" ? "/api/export" : `/api/export/${format}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: range.from,
        to: range.to,
        type: typeFilter,
        q: q.trim() || undefined,
        client: client.trim() || undefined,
        contract: contract.trim() || undefined,
        sort: sortMode,
      }),
    });
    if (!res.ok) {
      throw new Error("Falha ao exportar");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${typeFilter}_${range.from}_${range.to}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const openOsDetail = async (osId: string) => {
    setSelectedOsLoading(true);
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      const response = await apiGet<{ detail: OsDetail }>(
        `/api/os/${encodeURIComponent(osId)}/details?${params.toString()}`
      );
      setSelectedOs(response.detail);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar detalhes da OS");
    } finally {
      setSelectedOsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Base de dados
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">OS e Registros</h1>
          <div className="mt-2 text-sm text-app-soft">
            {total} registro(s) com movimentação no período • Volume:{" "}
            {volumeLoading ? "..." : volume == null ? "—" : `${formatTons(volume)} t`}
            {canAccessFaturamento ? (
              <> • Faturamento: {volumeLoading ? "..." : revenue == null ? "—" : brl.format(revenue)}</>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
            )}
            onClick={() => exportFile("csv").catch((e) => toast.error(String(e)))}
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
            )}
            onClick={() => exportFile("xlsx").catch((e) => toast.error(String(e)))}
          >
            <Download className="h-4 w-4" />
            Excel
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
            )}
            onClick={() => exportFile("pdf").catch((e) => toast.error(String(e)))}
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        </div>
      </header>

      <ChartCard
        title="Registros"
        subtitle="Pesquisa por id/OS/contrato/cliente/ponto e paginação"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex h-10 rounded-2xl bg-surface-soft p-1 ring-1 ring-app">
              {typeFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-xl px-3 text-sm transition",
                    typeFilter === option.value
                      ? "bg-surface-hover text-app ring-1 ring-app"
                      : "text-app-soft hover:text-app"
                  )}
                  onClick={() => setTypeFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={clientsLoading}
              className={cn(
                "h-10 w-56 rounded-2xl bg-surface-soft px-3 text-sm text-app",
                "outline-none ring-1 ring-app focus:ring-app-strong"
              )}
            >
              <option value="">Todos os clientes</option>
              {clientOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              disabled={contractsLoading}
              className={cn(
                "h-10 w-52 rounded-2xl bg-surface-soft px-3 text-sm text-app",
                "outline-none ring-1 ring-app focus:ring-app-strong"
              )}
            >
              <option value="">Todos os contratos</option>
              {contractOptions.map((number) => (
                <option key={number} value={number}>
                  {number}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={cn(
                "h-10 w-44 rounded-2xl bg-surface-soft px-3 text-sm text-app",
                "outline-none ring-1 ring-app focus:ring-app-strong"
              )}
            >
              <option value="date">Ordenar por data</option>
              <option value="contract">Ordenar por contrato</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar OS, contrato..."
                className={cn(
                  "h-10 w-64 rounded-2xl bg-surface-soft pl-10 pr-3 text-sm text-app",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
          </div>
        }
      >
        <div className="overflow-hidden rounded-2xl ring-1 ring-app">
          <div className="overflow-auto">
            <table className="min-w-[1260px] w-full text-left text-sm">
              <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">OS</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Ponto</th>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Ton</th>
                  <th className="px-4 py-3">RNE</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-app-soft" colSpan={10}>
                      Carregando...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-mono text-app-muted">{r.date}</td>
                      <td className="px-4 py-3 font-mono">{r.id}</td>
                      <td className="px-4 py-3 font-mono text-app-muted">{r.contractNumber ?? "—"}</td>
                      <td className="px-4 py-3">{r.clientName}</td>
                      <td className="px-4 py-3">{r.embarkPoint}</td>
                      <td className="px-4 py-3 font-mono text-app-muted">{r.plate ?? "—"}</td>
                      <td className="px-4 py-3 font-mono">{formatTons(r.tons)}</td>
                      <td className="px-4 py-3 font-mono">
                        {r.rne == null ? "—" : r.rne}
                      </td>
                      <td className="px-4 py-3 text-app-muted">
                        {r.status ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={!r.osId && !r.id}
                          onClick={() => openOsDetail(r.osId ?? r.id)}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
                        >
                          <Eye className="h-4 w-4" />
                          Detalhar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-app-soft" colSpan={10}>
                      Sem registros para o período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-app-soft">
            Página {page} de {pages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                "h-9 rounded-xl px-3 text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
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
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
              )}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
            >
              Próxima
            </button>
          </div>
        </div>
      </ChartCard>
      {selectedOs ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="w-full max-w-[1050px] overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Detalhes da OS
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">{selectedOs.osId}</h2>
                <div className="mt-1 text-sm text-app-soft">
                  {selectedOs.clientName ?? "Cliente não informado"} · {selectedOs.embarkPoint ?? "Ponto não informado"}
                </div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setSelectedOs(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-auto p-5">
              <div className={cn("grid grid-cols-1 gap-3", canAccessFaturamento ? "md:grid-cols-4" : "md:grid-cols-2")}>
                <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
                  <div className="text-xs uppercase tracking-[0.16em] text-app-faint">Volume</div>
                  <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
                    {formatTons(selectedOs.tonsTotal)} t
                  </FitValue>
                </div>
                <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
                  <div className="text-xs uppercase tracking-[0.16em] text-app-faint">RNE</div>
                  <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
                    {selectedOs.rneCount}
                  </FitValue>
                </div>
                {canAccessFaturamento ? (
                  <>
                    <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
                      <div className="text-xs uppercase tracking-[0.16em] text-app-faint">Diárias</div>
                      <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
                        {selectedOs.dailyFeeCount}
                      </FitValue>
                    </div>
                    <div className="rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
                      <div className="text-xs uppercase tracking-[0.16em] text-app-faint">Faturamento</div>
                      <FitValue className="mt-2" maxRem={1.125} minRem={0.85}>
                        {brl.format(selectedOs.revenueEstimatedBRL)}
                      </FitValue>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-app">
                <div className="overflow-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Registro</th>
                        <th className="px-4 py-3">Contrato</th>
                        <th className="px-4 py-3">Placa</th>
                        <th className="px-4 py-3">Ton</th>
                        <th className="px-4 py-3">RNE</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-app">
                      {selectedOs.records.map((record) => (
                        <tr key={record.id} className="hover:bg-surface-hover">
                          <td className="px-4 py-3 font-mono text-app-muted">{record.date}</td>
                          <td className="px-4 py-3 font-mono">{record.id}</td>
                          <td className="px-4 py-3 font-mono text-app-muted">{record.contractNumber ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-app-muted">{record.plate ?? "—"}</td>
                          <td className="px-4 py-3 font-mono">{formatTons(record.tons)}</td>
                          <td className="px-4 py-3 font-mono">{record.rne ?? "—"}</td>
                          <td className="px-4 py-3 text-app-muted">{record.status ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {selectedOsLoading ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-2xl bg-app-panel px-4 py-3 text-sm shadow-app ring-1 ring-app">
          Carregando OS...
        </div>
      ) : null}
    </div>
  );
}
