import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  Image,
  Plus,
  RefreshCw,
  Sheet,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";
import { toIsoDate } from "@/stores/useRangeStore";

type Classificador = {
  id: string;
  nome: string;
  email: string | null;
  whatsapp: string | null;
  municipio: string | null;
  uf: string | null;
  status: string | null;
  ativo: boolean;
};

type OsAtiva = {
  osId: string;
  detailId: string | null;
  clientName: string | null;
  embarkPoint: string | null;
  produto: string | null;
  loteKg: number | null;
  embarcadosKg: number | null;
  remanescenteKg: number | null;
  destino: string | null;
  status: string | null;
};

type OsDetalhe = {
  clientName: string | null;
  destino: string | null;
  produto: string | null;
  embarque: string | null;
  loteKg: number | null;
  embarcadosKg: number | null;
  remanescenteKg: number | null;
  status: string | null;
};

type ProgramacaoItem = {
  id: string;
  classificadorId: string | null;
  classificadorNome: string;
  cliente: string | null;
  localEmbarque: string;
  osId: string;
  destino: string | null;
  fazendaArmazem: string | null;
  volumeRemanescente: number | null;
  volumeEmbarcado: number | null;
  volumeOs: number | null;
  produto: string | null;
};

type Programacao = {
  id: string;
  data: string;
  itens: ProgramacaoItem[];
  importSourceDate: string | null;
  importReference: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const PdfIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v5h5" />
    <path d="M5 13h14" />
    <text
      x="12"
      y="18"
      textAnchor="middle"
      fontSize="5.2"
      fontWeight="700"
      fill="currentColor"
      stroke="none"
      fontFamily="system-ui, sans-serif"
    >
      PDF
    </text>
  </svg>
);

const tomorrowIso = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
};

const downloadBlob = async (url: string, filename: string) => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Falha no download");
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
};

const effectiveRemanescenteKg = (args: {
  loteKg: number | null | undefined;
  embarcadosKg: number | null | undefined;
  remanescenteKg: number | null | undefined;
}): number | null => {
  const lote = Number(args.loteKg ?? 0);
  const embarcados = Number(args.embarcadosKg ?? 0);
  const remanescente = Number(args.remanescenteKg ?? 0);

  if (lote > 0 && embarcados <= 0 && remanescente <= 0) return lote;
  if (args.remanescenteKg == null) return null;
  return args.remanescenteKg;
};

const needsOsDetail = (os: OsAtiva | null): boolean => {
  if (!os?.detailId?.trim()) return false;
  return (
    !os.clientName?.trim() ||
    !os.embarkPoint?.trim() ||
    !os.produto?.trim() ||
    !os.destino?.trim() ||
    os.loteKg == null ||
    os.embarcadosKg == null ||
    os.remanescenteKg == null
  );
};

export default function Programacao() {
  const toast = useToast();
  const [data, setData] = useState(tomorrowIso());
  const [programacaoId, setProgramacaoId] = useState<string | null>(null);
  const [itens, setItens] = useState<ProgramacaoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [classificadores, setClassificadores] = useState<Classificador[]>([]);
  const [classificadoresLoading, setClassificadoresLoading] = useState(false);
  const [osAtivas, setOsAtivas] = useState<OsAtiva[]>([]);
  const [osAtivasLoading, setOsAtivasLoading] = useState(false);

  const [newClassificadorId, setNewClassificadorId] = useState("");
  const [newOsId, setNewOsId] = useState("");
  const [osPickerOpen, setOsPickerOpen] = useState(false);
  const [osSearch, setOsSearch] = useState("");
  const [osDetalhe, setOsDetalhe] = useState<OsDetalhe | null>(null);
  const [osDetalheLoading, setOsDetalheLoading] = useState(false);

  const [history, setHistory] = useState<
    Array<{
      id: string;
      data: string;
      importSourceDate: string | null;
      importReference: string | null;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);
  const [preview, setPreview] = useState<{
    data: string;
    url: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceDate, setImportSourceDate] = useState(toIsoDate(new Date()));
  const [importTargetDate, setImportTargetDate] = useState(data);
  const [importing, setImporting] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<{ id: string; data: string } | null>(null);
  const [duplicateTargetDate, setDuplicateTargetDate] = useState(tomorrowIso());
  const [duplicating, setDuplicating] = useState(false);

  const selectedClassificador = useMemo(() => {
    return classificadores.find((c) => c.id === newClassificadorId) ?? null;
  }, [classificadores, newClassificadorId]);

  const selectedOs = useMemo(() => {
    return osAtivas.find((o) => o.osId === newOsId) ?? null;
  }, [newOsId, osAtivas]);

  const filteredOsAtivas = useMemo(() => {
    const query = osSearch.trim().toLowerCase();
    const source = query
      ? osAtivas.filter((o) =>
          [o.osId, o.clientName, o.embarkPoint, o.destino, o.status]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query)
        )
      : osAtivas;
    return source.slice(0, 80);
  }, [osAtivas, osSearch]);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  useEffect(() => {
    let alive = true;
    const id = selectedOs?.detailId?.trim() ?? "";
    if (!selectedOs || !needsOsDetail(selectedOs)) {
      setOsDetalhe(null);
      setOsDetalheLoading(false);
      return;
    }

    setOsDetalheLoading(true);
    apiGet<{ detalhe: OsDetalhe }>(`/api/classific/os-detalhe/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!alive) return;
        setOsDetalhe(r.detalhe ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setOsDetalhe(null);
      })
      .finally(() => {
        if (!alive) return;
        setOsDetalheLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selectedOs]);

  const displayOs = useMemo(() => {
    if (!selectedOs) return null;
    const d = osDetalhe;
    return {
      osId: selectedOs.osId,
      clientName: d?.clientName ?? selectedOs.clientName,
      embarkPoint: d?.embarque ?? selectedOs.embarkPoint,
      produto: d?.produto ?? selectedOs.produto,
      loteKg: d?.loteKg ?? selectedOs.loteKg,
      embarcadosKg: d?.embarcadosKg ?? selectedOs.embarcadosKg,
      remanescenteKg: d?.remanescenteKg ?? selectedOs.remanescenteKg,
      destino: d?.destino ?? selectedOs.destino,
      status: d?.status ?? selectedOs.status,
    };
  }, [osDetalhe, selectedOs]);

  const loadClassificadores = async () => {
    setClassificadoresLoading(true);
    try {
      const r = await apiGet<{ items: Classificador[] }>(
        "/api/classificadores?onlyActive=1"
      );
      setClassificadores(r.items ?? []);
    } finally {
      setClassificadoresLoading(false);
    }
  };

  const syncClassificadores = async () => {
    setClassificadoresLoading(true);
    try {
      await apiJson<{ synced: number }>("/api/classificadores/sync", {
        method: "POST",
      });
      await loadClassificadores();
      toast.success("Classificadores sincronizados.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar classificadores");
    } finally {
      setClassificadoresLoading(false);
    }
  };

  const loadOsAtivas = async () => {
    setOsAtivasLoading(true);
    try {
      const r = await apiGet<{ items: OsAtiva[] }>("/api/classific/os-ativas");
      setOsAtivas(r.items ?? []);
    } finally {
      setOsAtivasLoading(false);
    }
  };

  const loadHistory = async (page = historyPage) => {
    setHistoryLoading(true);
    try {
      const r = await apiGet<{
        items: Array<{
          id: string;
          data: string;
          importSourceDate: string | null;
          importReference: string | null;
        }>;
        total: number;
      }>(`/api/programacoes?page=${page}&pageSize=${historyPageSize}`);
      setHistory(r.items ?? []);
      setHistoryTotal(r.total ?? 0);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadByDate = async (date: string) => {
    setLoading(true);
    try {
      const r = await apiGet<{ programacao: Programacao | null }>(
        `/api/programacoes/by-date?date=${encodeURIComponent(date)}`
      );
      const p = r.programacao;
      if (!p) {
        setProgramacaoId(null);
        setItens([]);
        return;
      }
      setProgramacaoId(p.id);
      setItens(p.itens ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar programação");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClassificadores().catch(() => undefined);
    loadOsAtivas().catch(() => undefined);
  }, []);

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [historyPage, historyPageSize]);

  useEffect(() => {
    loadByDate(data).catch(() => undefined);
  }, [data]);

  const addItem = () => {
    const classificadorNome = selectedClassificador?.nome?.trim() ?? "";
    const osId = newOsId.trim();

    if (!classificadorNome || !osId) {
      toast.error("Preencha classificador e O.S.");
      return;
    }

    if (!selectedOs) {
      toast.error("O.S. inválida.");
      return;
    }

    const src = displayOs;
    if (!src) {
      toast.error("Selecione uma O.S.");
      return;
    }

    const volumeRemanescente = effectiveRemanescenteKg({
      loteKg: src.loteKg,
      embarcadosKg: src.embarcadosKg,
      remanescenteKg: src.remanescenteKg,
    });

    setItens((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        classificadorId: selectedClassificador?.id ?? null,
        classificadorNome,
        cliente: src.clientName ?? null,
        localEmbarque: src.embarkPoint ?? "",
        osId,
        destino: src.destino ?? null,
        fazendaArmazem: src.embarkPoint ?? null,
        volumeRemanescente,
        volumeEmbarcado: src.embarcadosKg ?? null,
        volumeOs: src.loteKg ?? null,
        produto: src.produto ?? null,
      },
    ]);

    setNewClassificadorId("");
    setNewOsId("");
    setOsSearch("");
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        data,
        itens: itens.map((i) => ({
          id: i.id,
          classificadorId: i.classificadorId,
          classificadorNome: i.classificadorNome,
          cliente: i.cliente,
          localEmbarque: i.localEmbarque,
          osId: i.osId,
          destino: i.destino,
          fazendaArmazem: i.fazendaArmazem,
          volumeRemanescente: effectiveRemanescenteKg({
            loteKg: i.volumeOs,
            embarcadosKg: i.volumeEmbarcado,
            remanescenteKg: i.volumeRemanescente,
          }),
          volumeEmbarcado: i.volumeEmbarcado,
          volumeOs: i.volumeOs,
          produto: i.produto,
        })),
      };

      const r = await apiJson<{ programacao: Programacao }>(
        programacaoId ? `/api/programacoes/${programacaoId}` : "/api/programacoes",
        { method: programacaoId ? "PUT" : "POST", body: payload }
      );

      setProgramacaoId(r.programacao.id);
      setItens(r.programacao.itens ?? []);
      setHistoryPage(1);
      await loadHistory(1);
      toast.success("Programação salva.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar programação");
    } finally {
      setSaving(false);
    }
  };

  const openImportModal = () => {
    setImportSourceDate(toIsoDate(new Date()));
    setImportTargetDate(data);
    setImportOpen(true);
  };

  const importMovements = async () => {
    if (!importSourceDate || !importTargetDate) {
      toast.error("Informe as datas da importação.");
      return;
    }

    if (
      itens.length > 0 &&
      !window.confirm(
        "Importar vai substituir os itens da programação de destino. Deseja continuar?"
      )
    ) {
      return;
    }

    setImporting(true);
    try {
      const r = await apiJson<{ programacao: Programacao; importedCount: number }>(
        "/api/programacoes/import-movements",
        {
          method: "POST",
          body: {
            sourceDate: importSourceDate,
            targetDate: importTargetDate,
          },
        }
      );

      setData(r.programacao.data);
      setProgramacaoId(r.programacao.id);
      setItens(r.programacao.itens ?? []);
      setHistoryPage(1);
      await loadHistory(1);
      setImportOpen(false);
      toast.success(
        r.importedCount
          ? `${r.importedCount} O.S. importada(s) para a programação.`
          : "Nenhuma O.S. movimentada encontrada para importar."
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar programação");
    } finally {
      setImporting(false);
    }
  };

  const openDuplicateModal = (source: { id: string; data: string }) => {
    const next = new Date(`${source.data}T12:00:00`);
    next.setDate(next.getDate() + 1);
    setDuplicateSource(source);
    setDuplicateTargetDate(toIsoDate(next));
    setDuplicateOpen(true);
  };

  const duplicateProgramacao = async () => {
    if (!duplicateSource || !duplicateTargetDate) {
      toast.error("Informe a data da nova programação.");
      return;
    }
    if (duplicateTargetDate === duplicateSource.data) {
      toast.error("Escolha uma data diferente da programação original.");
      return;
    }

    setDuplicating(true);
    try {
      const existing = await apiGet<{ programacao: Programacao | null }>(
        `/api/programacoes/by-date?date=${encodeURIComponent(duplicateTargetDate)}`
      );
      if (existing.programacao) {
        toast.error("Já existe programação salva para essa data.");
        return;
      }

      const source = await apiGet<{ programacao: Programacao }>(
        `/api/programacoes/${encodeURIComponent(duplicateSource.id)}`
      );
      const r = await apiJson<{ programacao: Programacao }>("/api/programacoes", {
        method: "POST",
        body: {
          data: duplicateTargetDate,
          itens: source.programacao.itens.map((item) => ({
            ...item,
            id: crypto.randomUUID(),
          })),
        },
      });

      setData(r.programacao.data);
      setProgramacaoId(r.programacao.id);
      setItens(r.programacao.itens ?? []);
      setHistoryPage(1);
      await loadHistory(1);
      setDuplicateOpen(false);
      toast.success("Programação duplicada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao duplicar programação");
    } finally {
      setDuplicating(false);
    }
  };

  const removeItem = (id: string) => {
    setItens((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, patch: Partial<ProgramacaoItem>) => {
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const deleteHistory = async (id: string) => {
    try {
      await apiJson("/api/programacoes/" + id, { method: "DELETE" });
      if (programacaoId === id) {
        setProgramacaoId(null);
        setItens([]);
      }
      await loadHistory(historyPage);
      toast.success("Programação deletada.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao deletar programação");
    }
  };

  const exportXlsx = async (id: string, date: string) => {
    await downloadBlob(`/api/programacoes/${id}/export/xlsx`, `programacao_${date}.xlsx`);
  };

  const exportPdf = async (id: string, date: string) => {
    await downloadBlob(`/api/programacoes/${id}/export/pdf`, `programacao_${date}.pdf`);
  };

  const previewPdf = async (id: string, date: string) => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/programacoes/${id}/export/pdf`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Falha ao carregar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { data: date, url };
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao visualizar programação");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const exportPng = async (id: string, date: string) => {
    await downloadBlob(`/api/programacoes/${id}/export/png`, `programacao_${date}.png`);
  };

  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));
  const formatKg = (value: number | null | undefined): string =>
    value == null ? "—" : new Intl.NumberFormat("pt-BR").format(value);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">Planejamento</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Programação</h1>
          <div className="mt-2 text-sm text-app-soft">
            Monte a programação do dia seguinte e salve para editar, exportar e reutilizar.
          </div>
        </div>
      </header>

      <ChartCard
        title="Edição"
        subtitle="Selecione a data e adicione linhas para salvar a programação"
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={cn(
                "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:w-auto sm:text-sm",
                "outline-none ring-1 ring-app focus:ring-app-strong"
              )}
            />
            <button
              type="button"
              disabled={saving || loading || importing}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base sm:h-10 sm:w-auto sm:text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
                "disabled:opacity-40"
              )}
              onClick={openImportModal}
            >
              <Upload className="h-4 w-4" />
              Importar
            </button>
            <button
              type="button"
              disabled={saving || loading}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base sm:h-10 sm:w-auto sm:text-sm",
                "bg-emerald-500/15 text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/20",
                "disabled:opacity-40"
              )}
              onClick={() => save().catch(() => undefined)}
            >
              Salvar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Classificador</div>
              <div className="flex items-center gap-2">
                <select
                  value={newClassificadorId}
                  onChange={(e) => setNewClassificadorId(e.target.value)}
                  disabled={classificadoresLoading}
                  className={cn(
                    "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                    "outline-none ring-1 ring-app focus:ring-app-strong"
                  )}
                >
                  <option value="">Selecione...</option>
                  {classificadores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={classificadoresLoading}
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10",
                    "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
                    "disabled:opacity-40"
                  )}
                  title="Sincronizar classificadores"
                  aria-label="Sincronizar classificadores"
                  onClick={() => syncClassificadores().catch(() => undefined)}
                >
                  <RefreshCw className={cn("h-4 w-4", classificadoresLoading ? "animate-spin" : "")} />
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">O.S.</div>
              <div className="flex items-center gap-2">
                <select
                  value={newOsId}
                  onChange={(e) => setNewOsId(e.target.value)}
                  disabled={osAtivasLoading}
                  className={cn(
                    "hidden h-10 w-full rounded-2xl bg-surface-soft px-3 text-sm text-app md:block",
                    "outline-none ring-1 ring-app focus:ring-app-strong"
                  )}
                >
                  <option value="">Selecione...</option>
                  {osAtivas.map((o) => (
                    <option key={o.osId} value={o.osId}>
                      {o.osId}
                      {o.clientName ? ` • ${o.clientName}` : ""}
                      {o.embarkPoint ? ` • ${o.embarkPoint}` : ""}
                      {o.status ? ` • ${o.status}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={osAtivasLoading}
                  onClick={() => {
                    setOsPickerOpen(true);
                    if (!osAtivas.length && !osAtivasLoading) {
                      loadOsAtivas().catch(() => undefined);
                    }
                  }}
                  className={cn(
                    "flex h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl bg-surface-soft px-3 text-left text-base text-app ring-1 ring-app md:hidden",
                    "disabled:opacity-40"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {selectedOs ? selectedOs.osId : "Escolher O.S."}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-app-soft">
                      {selectedOs?.clientName ?? "Toque para buscar por OS, cliente ou local"}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-app-soft" />
                </button>
                <button
                  type="button"
                  disabled={osAtivasLoading}
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-10 sm:w-10",
                    "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
                    "disabled:opacity-40"
                  )}
                  title="Recarregar O.S."
                  aria-label="Recarregar O.S."
                  onClick={() => loadOsAtivas().catch(() => undefined)}
                >
                  <RefreshCw className={cn("h-4 w-4", osAtivasLoading ? "animate-spin" : "")} />
                </button>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Cliente</div>
              <input
                value={displayOs?.clientName ?? ""}
                readOnly
                placeholder="Cliente da O.S."
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>

            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Local de embarque</div>
              <input
                value={displayOs?.embarkPoint ?? ""}
                readOnly
                placeholder="Ex.: Ponto de embarque"
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Destino</div>
              <input
                value={
                  osDetalheLoading ? "Carregando..." : displayOs?.destino ?? ""
                }
                readOnly
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Fazenda/Armazém</div>
              <input
                value={displayOs?.embarkPoint ?? ""}
                readOnly
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
            <div className="lg:col-span-1">
              <div className="mb-1 text-xs text-app-soft">Vol. O.S. (Lote)</div>
              <input
                value={displayOs?.loteKg == null ? "" : String(displayOs.loteKg)}
                readOnly
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
            <div className="lg:col-span-1">
              <div className="mb-1 text-xs text-app-soft">Embarcados</div>
              <input
                value={displayOs?.embarcadosKg == null ? "" : String(displayOs.embarcadosKg)}
                readOnly
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
            <div className="lg:col-span-1">
              <div className="mb-1 text-xs text-app-soft">Remanescente</div>
              <input
                value={
                  displayOs
                    ? String(
                        effectiveRemanescenteKg({
                          loteKg: displayOs.loteKg,
                          embarcadosKg: displayOs.embarcadosKg,
                          remanescenteKg: displayOs.remanescenteKg,
                        }) ?? ""
                      )
                    : ""
                }
                readOnly
                className={cn(
                  "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                  "outline-none ring-1 ring-app focus:ring-app-strong"
                )}
              />
            </div>
            <div className="lg:col-span-2">
              <div className="mb-1 text-xs text-app-soft">Produto</div>
              <div className="flex items-center gap-2">
                <input
                  value={displayOs?.produto ?? ""}
                  readOnly
                  className={cn(
                    "h-12 w-full rounded-2xl bg-surface-soft px-3 text-base text-app sm:h-10 sm:text-sm",
                    "outline-none ring-1 ring-app focus:ring-app-strong"
                  )}
                />
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base sm:h-10 sm:w-auto sm:text-sm",
                    "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                  )}
                  onClick={addItem}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 md:hidden">
            {loading ? (
              <div className="rounded-2xl bg-surface-soft p-3 text-sm text-app-soft ring-1 ring-app">
                Carregando...
              </div>
            ) : itens.length ? (
              itens.map((i, index) => (
                <div key={i.id} className="rounded-2xl bg-surface-soft p-3 ring-1 ring-app">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded-full bg-app/70 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-app-faint ring-1 ring-app">
                          {index + 1}
                        </span>
                        <span className="truncate font-mono text-base font-semibold text-app">{i.osId}</span>
                      </div>
                      <div className="mt-1 truncate text-xs text-app-soft">{i.produto ?? "Produto não informado"}</div>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-800 ring-1 ring-rose-500/20 transition active:scale-[0.98] dark:text-rose-100"
                      aria-label="Remover"
                      title="Remover"
                      onClick={() => removeItem(i.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-app-faint">Classificador</div>
                    <input
                      value={i.classificadorNome}
                      onChange={(e) => updateItem(i.id, { classificadorNome: e.target.value })}
                      className={cn(
                        "h-10 w-full rounded-xl bg-app px-3 text-sm text-app",
                        "outline-none ring-1 ring-app focus:ring-app-strong"
                      )}
                    />
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex gap-2 rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <span className="w-20 shrink-0 text-[11px] uppercase tracking-[0.12em] text-app-faint">Cliente</span>
                      <span className="min-w-0 flex-1 text-app">{i.cliente ?? "—"}</span>
                    </div>
                    <div className="flex gap-2 rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <span className="w-20 shrink-0 text-[11px] uppercase tracking-[0.12em] text-app-faint">Embarque</span>
                      <span className="min-w-0 flex-1 text-app">{i.localEmbarque || "—"}</span>
                    </div>
                    <div className="flex gap-2 rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <span className="w-20 shrink-0 text-[11px] uppercase tracking-[0.12em] text-app-faint">Destino</span>
                      <span className="min-w-0 flex-1 text-app">{i.destino ?? "—"}</span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-app-faint">Lote</div>
                      <div className="mt-1 font-mono text-sm text-app">{formatKg(i.volumeOs)}</div>
                    </div>
                    <div className="rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-app-faint">Emb.</div>
                      <div className="mt-1 font-mono text-sm text-app">{formatKg(i.volumeEmbarcado)}</div>
                    </div>
                    <div className="rounded-xl bg-app/60 p-2.5 ring-1 ring-app">
                      <div className="text-[11px] uppercase tracking-[0.12em] text-app-faint">Rem.</div>
                      <div className="mt-1 font-mono text-sm text-app">
                        {formatKg(
                          effectiveRemanescenteKg({
                            loteKg: i.volumeOs,
                            embarcadosKg: i.volumeEmbarcado,
                            remanescenteKg: i.volumeRemanescente,
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-surface-soft p-3 text-sm text-app-soft ring-1 ring-app">
                Sem itens para a data.
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-2xl ring-1 ring-app md:block">
            <div className="overflow-auto">
              <table className="min-w-[1250px] w-full text-left text-sm">
                <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                  <tr>
                    <th className="px-4 py-3">Classificador</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Embarque</th>
                    <th className="px-4 py-3">O.S.</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Fazenda/Armazém</th>
                    <th className="px-4 py-3">VOL. O.S. (Lote)</th>
                    <th className="px-4 py-3">Embarcados</th>
                    <th className="px-4 py-3">Remanescente</th>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app">
                  {loading ? (
                    <tr>
                      <td className="px-4 py-6 text-app-soft" colSpan={11}>
                        Carregando...
                      </td>
                    </tr>
                  ) : itens.length ? (
                    itens.map((i) => (
                      <tr key={i.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3">
                          <input
                            value={i.classificadorNome}
                            onChange={(e) =>
                              updateItem(i.id, { classificadorNome: e.target.value })
                            }
                            className={cn(
                              "h-9 w-full rounded-xl bg-surface-soft px-2 text-sm text-app",
                              "outline-none ring-1 ring-app focus:ring-app-strong"
                            )}
                          />
                        </td>
                        <td className="px-4 py-3 text-app-muted">{i.cliente ?? "—"}</td>
                        <td className="px-4 py-3 text-app-muted">{i.localEmbarque}</td>
                        <td className="px-4 py-3 font-mono">{i.osId}</td>
                        <td className="px-4 py-3 text-app-muted">{i.destino ?? "—"}</td>
                        <td className="px-4 py-3 text-app-muted">{i.fazendaArmazem ?? "—"}</td>
                        <td className="px-4 py-3 font-mono">
                          {i.volumeOs == null ? "—" : i.volumeOs}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {i.volumeEmbarcado == null ? "—" : i.volumeEmbarcado}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {effectiveRemanescenteKg({
                            loteKg: i.volumeOs,
                            embarcadosKg: i.volumeEmbarcado,
                            remanescenteKg: i.volumeRemanescente,
                          }) ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-app-muted">{i.produto ?? "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            aria-label="Remover"
                            title="Remover"
                            onClick={() => removeItem(i.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-app-soft" colSpan={11}>
                        Sem itens para a data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </ChartCard>

      <ChartCard
        title="Histórico"
        subtitle="Programações salvas (por dia)"
        actions={
          <button
            type="button"
            disabled={historyLoading}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
            )}
            onClick={() => loadHistory().catch(() => undefined)}
          >
            <RefreshCw className="h-4 w-4" />
            Recarregar
          </button>
        }
      >
        <div className="space-y-2 md:hidden">
          {historyLoading ? (
            <div className="rounded-2xl bg-surface-soft p-3 text-sm text-app-soft ring-1 ring-app">
              Carregando...
            </div>
          ) : history.length ? (
            history.map((h) => (
              <div key={h.id} className="rounded-2xl bg-surface-soft p-3 ring-1 ring-app">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate font-mono text-base font-semibold text-app">{h.data}</div>
                      {h.importSourceDate ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-100">
                          Importada
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-app/70 px-2 py-0.5 text-[11px] text-app-soft ring-1 ring-app">
                          Manual
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs text-app-soft">
                      {h.importSourceDate ? `Referência: ${h.importSourceDate}` : "Referência manual"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-6 gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-surface-hover ring-1 ring-app transition active:scale-[0.98] disabled:opacity-50"
                    disabled={previewLoading}
                    onClick={() => previewPdf(h.id, h.data).catch((e) => toast.error(String(e)))}
                    aria-label="Visualizar"
                    title="Visualizar"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-surface-hover ring-1 ring-app transition active:scale-[0.98]"
                    onClick={() => openDuplicateModal({ id: h.id, data: h.data })}
                    aria-label="Duplicar"
                    title="Duplicar"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-app/70 ring-1 ring-app transition active:scale-[0.98]"
                    onClick={() => exportPdf(h.id, h.data).catch((e) => toast.error(String(e)))}
                    aria-label="Baixar PDF"
                    title="Baixar PDF"
                  >
                    <PdfIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-app/70 ring-1 ring-app transition active:scale-[0.98]"
                    onClick={() => exportPng(h.id, h.data).catch((e) => toast.error(String(e)))}
                    aria-label="Baixar imagem"
                    title="Baixar imagem"
                  >
                    <Image className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-app/70 ring-1 ring-app transition active:scale-[0.98]"
                    onClick={() => exportXlsx(h.id, h.data).catch((e) => toast.error(String(e)))}
                    aria-label="Baixar Excel"
                    title="Baixar Excel"
                  >
                    <Sheet className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-rose-500/12 text-rose-800 ring-1 ring-rose-500/20 transition active:scale-[0.98] dark:text-rose-100"
                    onClick={() => deleteHistory(h.id).catch(() => undefined)}
                    aria-label="Excluir"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-surface-soft p-3 text-sm text-app-soft ring-1 ring-app">
              Sem programações salvas.
            </div>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-2xl ring-1 ring-app md:block">
          <div className="overflow-auto">
            <table className="min-w-[700px] w-full text-left text-sm">
              <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Referência</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {historyLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-app-soft" colSpan={3}>
                      Carregando...
                    </td>
                  </tr>
                ) : history.length ? (
                  history.map((h) => (
                    <tr key={h.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-mono text-app-muted">{h.data}</td>
                      <td className="px-4 py-3 text-app-soft">
                        {h.importSourceDate ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-100">
                            Importada de {h.importSourceDate}
                          </span>
                        ) : (
                          "Manual"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            disabled={previewLoading}
                            title="Visualizar"
                            aria-label="Visualizar"
                            onClick={() =>
                              previewPdf(h.id, h.data).catch((e) => toast.error(String(e)))
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            title="Duplicar"
                            aria-label="Duplicar"
                            onClick={() => openDuplicateModal({ id: h.id, data: h.data })}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            title="Baixar PDF"
                            aria-label="Baixar PDF"
                            onClick={() =>
                              exportPdf(h.id, h.data).catch((e) => toast.error(String(e)))
                            }
                          >
                            <PdfIcon className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            title="Baixar imagem"
                            aria-label="Baixar imagem"
                            onClick={() =>
                              exportPng(h.id, h.data).catch((e) => toast.error(String(e)))
                            }
                          >
                            <Image className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm",
                              "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                            )}
                            title="Baixar Excel"
                            aria-label="Baixar Excel"
                            onClick={() =>
                              exportXlsx(h.id, h.data).catch((e) => toast.error(String(e)))
                            }
                          >
                            <Sheet className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={cn(
                              "inline-flex h-9 w-9 items-center justify-center rounded-xl",
                              "bg-rose-500/15 text-rose-800 dark:text-rose-100 ring-1 ring-rose-500/25 transition hover:bg-rose-500/20"
                            )}
                            title="Deletar"
                            aria-label="Deletar"
                            onClick={() => deleteHistory(h.id).catch(() => undefined)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-6 text-app-soft" colSpan={3}>
                      Sem programações salvas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 text-sm text-app-soft md:flex-row md:items-center md:justify-between">
          <div>
            {historyTotal} programação(ões) · página {Math.min(historyPage, historyTotalPages)} de {historyTotalPages}
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
            <select
              value={historyPageSize}
              onChange={(e) => {
                setHistoryPageSize(Number(e.target.value));
                setHistoryPage(1);
              }}
              className="col-span-2 h-11 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app outline-none md:col-span-1 md:h-9"
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
            <button
              type="button"
              disabled={historyPage <= 1 || historyLoading}
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-soft px-3 ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50 md:h-9"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              type="button"
              disabled={historyPage >= historyTotalPages || historyLoading}
              onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-surface-soft px-3 ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50 md:h-9"
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </ChartCard>


      {osPickerOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-app md:hidden" role="dialog" aria-modal="true">
          <div className="pointer-events-none absolute inset-0 bg-app-backdrop" />
          <div className="relative flex min-h-0 flex-1 flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-app pb-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">Selecionar O.S.</div>
                <div className="mt-1 text-xl font-semibold">O.S. abertas</div>
              </div>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-soft ring-1 ring-app"
                onClick={() => setOsPickerOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <input
              value={osSearch}
              onChange={(e) => setOsSearch(e.target.value)}
              placeholder="Buscar OS, cliente ou local"
              className={cn(
                "mt-4 h-12 w-full shrink-0 rounded-2xl bg-surface-soft px-4 text-base text-app",
                "outline-none ring-1 ring-app focus:ring-app-strong"
              )}
              autoFocus
            />

            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {osAtivasLoading ? (
                <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">Carregando O.S...</div>
              ) : filteredOsAtivas.length ? (
                filteredOsAtivas.map((o) => (
                  <button
                    key={o.osId}
                    type="button"
                    onClick={() => {
                      setNewOsId(o.osId);
                      setOsSearch("");
                      setOsPickerOpen(false);
                    }}
                    className={cn(
                      "w-full rounded-2xl p-3 text-left ring-1 transition active:scale-[0.99]",
                      newOsId === o.osId
                        ? "bg-emerald-500/15 ring-emerald-500/30"
                        : "bg-surface-soft ring-app active:bg-surface-hover"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-base font-semibold text-app">{o.osId}</div>
                        <div className="mt-1 truncate text-sm text-app">{o.clientName ?? "Cliente não informado"}</div>
                        <div className="mt-1 line-clamp-2 text-xs text-app-soft">{o.embarkPoint ?? "Local não informado"}</div>
                      </div>
                      {o.status ? (
                        <span className="shrink-0 rounded-full bg-app/70 px-2.5 py-1 text-[11px] text-app-soft ring-1 ring-app">
                          {o.status}
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
                  Nenhuma O.S. encontrada.
                  <button
                    type="button"
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-surface-hover px-3 text-sm ring-1 ring-app"
                    onClick={() => loadOsAtivas().catch(() => undefined)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recarregar O.S.
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="flex h-[88vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app p-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Visualizar programação
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">
                  Programação {preview.data}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm",
                    "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                  )}
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = preview.url;
                    a.download = `programacao_${preview.data}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Baixar
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                  onClick={closePreview}
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              title={`Programação ${preview.data}`}
              src={preview.url}
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="w-full max-w-[620px] overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex items-start justify-between gap-4 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Importar programação
                </div>
                <h2 className="mt-1 text-lg font-semibold">OS movimentadas no dia</h2>
                <p className="mt-2 text-sm text-app-soft">
                  Busca as cargas movimentadas na data escolhida, monta os itens e salva na
                  programação de destino.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setImportOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-app-soft">
                    Movimentação de
                  </span>
                  <input
                    type="date"
                    value={importSourceDate}
                    onChange={(e) => setImportSourceDate(e.target.value)}
                    className={cn(
                      "h-11 w-full rounded-2xl bg-surface-soft px-3 text-sm text-app",
                      "outline-none ring-1 ring-app focus:ring-app-strong"
                    )}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-app-soft">
                    Salvar em
                  </span>
                  <input
                    type="date"
                    value={importTargetDate}
                    onChange={(e) => setImportTargetDate(e.target.value)}
                    className={cn(
                      "h-11 w-full rounded-2xl bg-surface-soft px-3 text-sm text-app",
                      "outline-none ring-1 ring-app focus:ring-app-strong"
                    )}
                  />
                </label>
              </div>

              <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
                A importação usa os movimentos e RNEs apenas para descobrir quais O.S. entram. Lote,
                embarcados, remanescente e destino vêm da ficha da O.S., seguindo a mesma lógica do
                preenchimento manual.
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={importing}
                  className="inline-flex h-10 items-center rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
                  onClick={() => setImportOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={importing}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/20",
                    "disabled:opacity-40"
                  )}
                  onClick={() => importMovements().catch(() => undefined)}
                >
                  <Upload className={cn("h-4 w-4", importing ? "animate-pulse" : "")} />
                  {importing ? "Importando..." : "Importar e salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay p-4">
          <div className="w-full max-w-[560px] overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex items-start justify-between gap-4 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Duplicar programação
                </div>
                <h2 className="mt-1 text-lg font-semibold">
                  Copiar {duplicateSource?.data ?? ""}
                </h2>
                <p className="mt-2 text-sm text-app-soft">
                  Cria uma nova programação com os mesmos itens e permite alterar a data antes de
                  salvar.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setDuplicateOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-app-soft">
                  Nova data
                </span>
                <input
                  type="date"
                  value={duplicateTargetDate}
                  onChange={(e) => setDuplicateTargetDate(e.target.value)}
                  className={cn(
                    "h-11 w-full rounded-2xl bg-surface-soft px-3 text-sm text-app",
                    "outline-none ring-1 ring-app focus:ring-app-strong"
                  )}
                />
              </label>

              <div className="rounded-2xl bg-surface-soft p-4 text-sm text-app-soft ring-1 ring-app">
                A programação original permanece salva. A nova cópia abre na edição logo após ser
                criada.
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={duplicating}
                  className="inline-flex h-10 items-center rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
                  onClick={() => setDuplicateOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={duplicating}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/20",
                    "disabled:opacity-40"
                  )}
                  onClick={() => duplicateProgramacao().catch(() => undefined)}
                >
                  <Copy className={cn("h-4 w-4", duplicating ? "animate-pulse" : "")} />
                  {duplicating ? "Duplicando..." : "Duplicar e abrir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
