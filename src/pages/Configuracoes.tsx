import { useEffect, useState } from "react";
import { ArrowUpRight, CloudDownload, Save, Search, Upload } from "lucide-react";
import ChartCard from "@/components/ChartCard";
import Card from "@/components/Card";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";

type BillingRules = {
  dailyFeeBRL: number;
  baseTariffBRLPerTon: number;
  minCadenceTons: number;
  excessMultiplier: number;
};

const Field = ({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) => {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app",
          "outline-none ring-1 ring-app focus:ring-app-strong"
        )}
      />
      {hint ? <div className="mt-2 text-xs text-app-faint">{hint}</div> : null}
    </label>
  );
};

export default function Configuracoes() {
  const toast = useToast();
  const [rules, setRules] = useState<BillingRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    apiGet<{ rules: BillingRules }>("/api/config")
      .then((r) => setRules(r.rules))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar")
      );
  }, []);

  const save = async () => {
    if (!rules) return;
    setSaving(true);
    try {
      await apiJson("/api/config", { method: "PUT", body: rules });
      toast.success("Regras salvas.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const discoverColumns = async () => {
    setDiscovering(true);
    try {
      const r = await apiGet<{
        discovery: {
          headers: Array<{ index: number; header: string; sample: string }>;
          suggested: { embarcadoHoje?: number };
          flySecretsCommand: string | null;
        };
      }>("/api/collect/discover");
      const hoje = r.discovery.suggested.embarcadoHoje;
      const cols = r.discovery.headers
        .map((c) => `${c.index}: ${c.header}${c.sample ? ` (ex: ${c.sample})` : ""}`)
        .join(" · ");
      toast.info(
        hoje == null
          ? `Colunas: ${cols}. Não achei "Embarcado Hoje" — veja a lista acima.`
          : `Embarcado Hoje = coluna ${hoje}. No terminal: ${r.discovery.flySecretsCommand ?? `fly secrets set CLASSIFIC_OS_EMBARCADO_HOJE_COL="${hoje}"`}`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao detectar colunas");
    } finally {
      setDiscovering(false);
    }
  };

  const runCollector = async () => {
    setRunning(true);
    try {
      const r = await apiJson<{
        imported: number;
        laudos?: number;
        rne?: number;
        duplicatesDropped?: number;
        removedStaleLaudos?: number;
        removedStaleRne?: number;
      }>("/api/collect/run", {
        method: "POST",
      });
      const dup =
        r.duplicatesDropped && r.duplicatesDropped > 0
          ? ` (${r.duplicatesDropped} duplicados ignorados)`
          : "";
      const removed =
        r.removedStaleLaudos && r.removedStaleLaudos > 0
          ? `, removidos: ${r.removedStaleLaudos}`
          : "";
      const removedRne =
        r.removedStaleRne && r.removedStaleRne > 0
          ? `, RNE removidos: ${r.removedStaleRne}`
          : "";
      toast.success(
        `Coleta concluída. Importados: ${r.imported} (laudos: ${r.laudos ?? "—"}, RNE: ${r.rne ?? 0}${removed}${removedRne})${dup}`,
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha na coleta");
    } finally {
      setRunning(false);
    }
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const contentBase64 = btoa(unescape(encodeURIComponent(text)));
      const r = await apiJson<{ imported: number }>("/api/import/csv", {
        method: "POST",
        body: { contentBase64, delimiter: ";" },
      });
      toast.success(`Importação concluída. Importados: ${r.imported}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Operação
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Configurações
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Ajuste regras e atualize a base de dados.
          </div>
        </div>
      </header>


      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Regras de faturamento"
          subtitle="Diária + tarifa por tonelada com cadência mínima por ponto"
          actions={
            <button
              type="button"
              onClick={() => save()}
              disabled={!rules || saving}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
              )}
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          }
        >
          {rules ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Diária (R$)"
                value={String(rules.dailyFeeBRL)}
                onChange={(v) =>
                  setRules({ ...rules, dailyFeeBRL: Number(v) || 0 })
                }
                hint="Usado no cálculo por OS movimentada no dia."
              />
              <Field
                label="Tarifa (R$/t)"
                value={String(rules.baseTariffBRLPerTon)}
                onChange={(v) =>
                  setRules({ ...rules, baseTariffBRLPerTon: Number(v) || 0 })
                }
                hint="Tarifa base por tonelada."
              />
              <Field
                label="Cadência mínima (t)"
                value={String(rules.minCadenceTons)}
                onChange={(v) =>
                  setRules({ ...rules, minCadenceTons: Number(v) || 0 })
                }
                hint="Mínimo faturado por OS movimentada."
              />
              <Field
                label="Multiplicador excedente"
                value={String(rules.excessMultiplier)}
                onChange={(v) =>
                  setRules({ ...rules, excessMultiplier: Number(v) || 0 })
                }
                hint="0 usa tarifa normal no excedente."
              />
            </div>
          ) : (
            <div className="text-sm text-app-soft">Carregando...</div>
          )}
        </ChartCard>

        <ChartCard
          title="Atualização de dados"
          subtitle="Coleta automática (Playwright) ou importação CSV"
        >
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Coletor</div>
                  <div className="mt-1 text-xs text-app-soft">
                    Precisa configurar variáveis de ambiente no servidor.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => discoverColumns()}
                    disabled={discovering || running}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                      "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
                    )}
                  >
                    <Search className="h-4 w-4" />
                    {discovering ? "Detectando..." : "Detectar colunas"}
                  </button>
                  <button
                    type="button"
                    onClick={() => runCollector()}
                    disabled={running || discovering}
                    className={cn(
                      "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                      "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
                    )}
                  >
                    <CloudDownload className="h-4 w-4" />
                    {running ? "Executando..." : "Rodar coleta"}
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-2xl bg-table-head p-3 text-xs text-app-soft ring-1 ring-app">
                <div className="font-mono">CLASSIFIC_USERNAME</div>
                <div className="font-mono">CLASSIFIC_PASSWORD</div>
                <div className="font-mono">CLASSIFIC_OS_LIST_URL</div>
                <div className="font-mono">CLASSIFIC_OS_ROW_SELECTOR</div>
                <div className="mt-2 flex items-center gap-2 text-app-soft">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  OS: ID, CLIENT, POINT, EMBARCADOS (kg), EMBARCADO_HOJE (kg). Laudos: DATE, ID, OS_ID.
                  Variáveis: CLASSIFIC_* no servidor (veja .env.example).
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Importação CSV</div>
                  <div className="mt-1 text-xs text-app-soft">
                    CSV com cabeçalho (id, date/data, cliente, ponto, toneladas/tons, rne).
                  </div>
                </div>
                <label
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center gap-2 rounded-2xl px-4 text-sm",
                    "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
                    importing ? "opacity-40 pointer-events-none" : ""
                  )}
                >
                  <Upload className="h-4 w-4" />
                  {importing ? "Importando..." : "Selecionar arquivo"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importCsv(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </Card>
          </div>
        </ChartCard>
      </section>
    </div>
  );
}
