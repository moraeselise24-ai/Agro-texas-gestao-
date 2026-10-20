import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Clock3,
  ClipboardCheck,
  ClipboardList,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  UploadCloud,
  Trash2,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import StatCard from "@/components/StatCard";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";
import { toIsoDate } from "@/stores/useRangeStore";

type OsStatus = "rascunho" | "pendente_envio" | "enviando" | "criada" | "erro" | "cancelada";

type PlaceOption = {
  name: string;
  municipio: string | null;
  uf: string | null;
};

type ServiceOrderFacets = {
  clients: string[];
  products: string[];
  embarks: PlaceOption[];
  destinations: PlaceOption[];
};

type Classificador = {
  id: string;
  nome: string;
  ativo: boolean;
};

type ServiceOrderDraft = {
  id: string;
  referenceCode: string;
  requestedDate: string;
  clientName: string;
  embarkPoint: string;
  embarkPointMunicipio: string | null;
  embarkPointUf: string | null;
  embarkPointNeedsCreate: boolean;
  destination: string;
  destinationMunicipio: string | null;
  destinationUf: string | null;
  destinationNeedsCreate: boolean;
  product: string;
  contractNumber: string | null;
  lotKg: number;
  classifierName: string | null;
  producerName: string | null;
  notes: string | null;
  status: OsStatus;
  classificOsId: string | null;
  botError: string | null;
};

type FormState = {
  id: string | null;
  requestedDate: string;
  clientName: string;
  embarkPoint: string;
  embarkPointMunicipio: string;
  embarkPointUf: string;
  embarkPointNeedsCreate: boolean;
  destination: string;
  destinationMunicipio: string;
  destinationUf: string;
  destinationNeedsCreate: boolean;
  product: string;
  contractNumber: string;
  lotKg: string;
  classifierName: string;
  producerName: string;
  notes: string;
};

const initialForm = (): FormState => ({
  id: null,
  requestedDate: toIsoDate(new Date()),
  clientName: "",
  embarkPoint: "",
  embarkPointMunicipio: "",
  embarkPointUf: "",
  embarkPointNeedsCreate: false,
  destination: "",
  destinationMunicipio: "",
  destinationUf: "",
  destinationNeedsCreate: false,
  product: "Soja",
  contractNumber: "",
  lotKg: "",
  classifierName: "",
  producerName: "",
  notes: "",
});

const statusLabels: Record<OsStatus, string> = {
  rascunho: "Rascunho",
  pendente_envio: "Fila de envio",
  enviando: "Enviando",
  criada: "Criada",
  erro: "Erro",
  cancelada: "Cancelada",
};

const statusClass: Record<OsStatus, string> = {
  rascunho: "bg-surface-soft text-app-muted ring-app",
  pendente_envio: "bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-100",
  enviando: "bg-sky-500/10 text-sky-800 ring-sky-500/20 dark:text-sky-100",
  criada: "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20 dark:text-emerald-100",
  erro: "bg-rose-500/10 text-rose-800 ring-rose-500/20 dark:text-rose-100",
  cancelada: "bg-zinc-500/10 text-app-muted ring-app",
};

const kgFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const parseKg = (value: string): number => {
  const clean = value.replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/\./g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const formatKgInput = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return kgFormatter.format(Number(digits));
};

const asOptionLabel = (option: PlaceOption): string => {
  const city = [option.municipio, option.uf].filter(Boolean).join(" - ");
  return city ? `${option.name} (${city})` : option.name;
};

const uniq = (items: string[]) =>
  [...new Set(items.map((item) => item.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

const defaultProductOptions = ["Soja", "Milho", "Sorgo", "Caroço de Algodão"];

const stateOptions = [
  { code: "AC", name: "Acre" },
  { code: "AL", name: "Alagoas" },
  { code: "AP", name: "Amapá" },
  { code: "AM", name: "Amazonas" },
  { code: "BA", name: "Bahia" },
  { code: "CE", name: "Ceará" },
  { code: "DF", name: "Distrito Federal" },
  { code: "ES", name: "Espírito Santo" },
  { code: "GO", name: "Goiás" },
  { code: "MA", name: "Maranhão" },
  { code: "MT", name: "Mato Grosso" },
  { code: "MS", name: "Mato Grosso do Sul" },
  { code: "MG", name: "Minas Gerais" },
  { code: "PA", name: "Pará" },
  { code: "PB", name: "Paraíba" },
  { code: "PR", name: "Paraná" },
  { code: "PE", name: "Pernambuco" },
  { code: "PI", name: "Piauí" },
  { code: "RJ", name: "Rio de Janeiro" },
  { code: "RN", name: "Rio Grande do Norte" },
  { code: "RS", name: "Rio Grande do Sul" },
  { code: "RO", name: "Rondônia" },
  { code: "RR", name: "Roraima" },
  { code: "SC", name: "Santa Catarina" },
  { code: "SP", name: "São Paulo" },
  { code: "SE", name: "Sergipe" },
  { code: "TO", name: "Tocantins" },
];

const stateNameFromValue = (value: string | null | undefined): string => {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  const found = stateOptions.find(
    (state) => state.code === clean.toUpperCase() || state.name.toLowerCase() === clean.toLowerCase()
  );
  return found?.name ?? clean;
};

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) => (
  <label className="block">
    <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
      {label}
      {required ? <span className="ml-1 text-rose-700 dark:text-rose-300">*</span> : null}
    </div>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className="mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
    />
  </label>
);

const SelectField = ({
  label,
  value,
  onChange,
  required,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  children: ReactNode;
}) => (
  <label className="block">
    <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
      {label}
      {required ? <span className="ml-1 text-rose-700 dark:text-rose-300">*</span> : null}
    </div>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      className="mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
    >
      {children}
    </select>
  </label>
);

const PlaceSelector = ({
  label,
  value,
  municipio,
  uf,
  needsCreate,
  options,
  onSelect,
  onChange,
  createLabel,
}: {
  label: string;
  value: string;
  municipio: string;
  uf: string;
  needsCreate: boolean;
  options: PlaceOption[];
  onSelect: (option: PlaceOption) => void;
  onChange: (patch: Partial<Pick<FormState, "embarkPoint" | "embarkPointMunicipio" | "embarkPointUf" | "embarkPointNeedsCreate" | "destination" | "destinationMunicipio" | "destinationUf" | "destinationNeedsCreate">>) => void;
  createLabel: string;
}) => (
  <div className="space-y-3 rounded-2xl bg-surface-soft/60 p-4 ring-1 ring-app">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-app-soft">{label}</div>
        <p className="mt-1 text-xs text-app-faint">
          Se já existir no Classific, selecione. Se não existir, cadastre os dados para o envio criar.
        </p>
      </div>
      <button
        type="button"
        onClick={() => onChange({})}
        className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-500/10 px-3 text-xs text-emerald-800 ring-1 ring-emerald-500/20 transition hover:bg-emerald-500/15 dark:text-emerald-100"
      >
        <Plus className="h-3.5 w-3.5" />
        {createLabel}
      </button>
    </div>

    {needsCreate ? (
      <div className="grid gap-3 md:grid-cols-[1fr_220px_100px]">
        <Field
          label="Nome"
          value={value}
          onChange={(next) =>
            onChange(
              label === "Embarque"
                ? { embarkPoint: next, embarkPointNeedsCreate: true }
                : { destination: next, destinationNeedsCreate: true }
            )
          }
          placeholder={label === "Embarque" ? "Ex.: Fazenda São José" : "Ex.: Cianport"}
          required
        />
        <Field
          label="Município"
          value={municipio}
          onChange={(next) =>
            onChange(
              label === "Embarque"
                ? { embarkPointMunicipio: next, embarkPointNeedsCreate: true }
                : { destinationMunicipio: next, destinationNeedsCreate: true }
            )
          }
          placeholder="Município"
          required
        />
        <SelectField
          label="UF"
          value={uf}
          onChange={(next) =>
            onChange(
              label === "Embarque"
                ? { embarkPointUf: next, embarkPointNeedsCreate: true }
                : { destinationUf: next, destinationNeedsCreate: true }
            )
          }
          required
        >
          <option value="">Selecione...</option>
          {stateOptions.map((state) => (
            <option key={state.code} value={state.name}>
              {state.name}
            </option>
          ))}
        </SelectField>
      </div>
    ) : (
      <SelectField
        label="Selecionar existente"
        value={value}
        onChange={(next) => {
          const option = options.find((item) => item.name === next);
          if (option) onSelect(option);
        }}
        required
      >
        <option value="">Selecione...</option>
        {options.map((option) => (
          <option key={`${option.name}-${option.municipio ?? ""}-${option.uf ?? ""}`} value={option.name}>
            {asOptionLabel(option)}
          </option>
        ))}
      </SelectField>
    )}
  </div>
);

export default function OrdensServico() {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [items, setItems] = useState<ServiceOrderDraft[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | OsStatus>("");
  const [page, setPage] = useState(1);
  const [facets, setFacets] = useState<ServiceOrderFacets>({
    clients: [],
    products: defaultProductOptions,
    embarks: [],
    destinations: [],
  });
  const [classificadores, setClassificadores] = useState<Classificador[]>([]);
  const pageSize = 12;

  const clientOptions = useMemo(() => uniq(facets.clients), [facets.clients]);
  const productOptions = useMemo(() => uniq([...defaultProductOptions, ...facets.products]), [facets.products]);
  const classifierOptions = useMemo(
    () => uniq(classificadores.filter((item) => item.ativo !== false).map((item) => item.nome)),
    [classificadores]
  );

  const summary = useMemo(() => {
    return {
      total,
      draft: items.filter((item) => item.status === "rascunho").length,
      queued: items.filter((item) => item.status === "pendente_envio").length,
      created: items.filter((item) => item.status === "criada").length,
    };
  }, [items, total]);

  const loadFacets = async () => {
    try {
      const [facetsResponse, classifiersResponse] = await Promise.all([
        apiGet<{ facets: ServiceOrderFacets }>("/api/service-orders/facets"),
        apiGet<{ items: Classificador[] }>("/api/classificadores?onlyActive=1"),
      ]);
      setFacets(facetsResponse.facets);
      setClassificadores(classifiersResponse.items ?? []);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar cadastros.");
    }
  };

  const load = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const response = await apiGet<{ items: ServiceOrderDraft[]; total: number }>(
        `/api/service-orders?${params.toString()}`
      );
      setItems(response.items ?? []);
      setTotal(response.total ?? 0);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar O.S.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1).catch(() => undefined);
    loadFacets().catch(() => undefined);
  }, []);

  const reset = () => setForm(initialForm());

  const startNewEmbark = () =>
    setForm((prev) => ({
      ...prev,
      embarkPoint: "",
      embarkPointMunicipio: "",
      embarkPointUf: "",
      embarkPointNeedsCreate: true,
    }));

  const startNewDestination = () =>
    setForm((prev) => ({
      ...prev,
      destination: "",
      destinationMunicipio: "",
      destinationUf: "",
      destinationNeedsCreate: true,
    }));

  const payload = (nextStatus?: OsStatus) => ({
    requestedDate: form.requestedDate,
    clientName: form.clientName.trim(),
    embarkPoint: form.embarkPoint.trim(),
    embarkPointMunicipio: form.embarkPointMunicipio.trim() || null,
    embarkPointUf: stateNameFromValue(form.embarkPointUf),
    embarkPointNeedsCreate: form.embarkPointNeedsCreate,
    destination: form.destination.trim(),
    destinationMunicipio: form.destinationMunicipio.trim() || null,
    destinationUf: stateNameFromValue(form.destinationUf),
    destinationNeedsCreate: form.destinationNeedsCreate,
    product: form.product.trim(),
    contractNumber: form.contractNumber.trim() || null,
    lotKg: parseKg(form.lotKg),
    classifierName: form.classifierName.trim() || null,
    producerName: form.producerName.trim() || null,
    notes: form.notes.trim() || null,
    status: nextStatus,
  });

  const save = async (event?: FormEvent, nextStatus?: OsStatus) => {
    event?.preventDefault();
    if (form.embarkPointNeedsCreate && (!form.embarkPointMunicipio.trim() || !form.embarkPointUf.trim())) {
      toast.error("Informe município e UF do embarque novo.");
      return;
    }
    if (form.destinationNeedsCreate && (!form.destinationMunicipio.trim() || !form.destinationUf.trim())) {
      toast.error("Informe município e UF do destino novo.");
      return;
    }

    setSaving(true);
    try {
      const body = payload(nextStatus);
      const response = await apiJson<{ order: ServiceOrderDraft }>(
        form.id ? `/api/service-orders/${form.id}` : "/api/service-orders",
        {
          method: form.id ? "PUT" : "POST",
          body,
        }
      );
      toast.success(nextStatus === "pendente_envio" ? "O.S. salva na fila de envio." : "O.S. salva.");
      setForm({
        id: response.order.id,
        requestedDate: response.order.requestedDate,
        clientName: response.order.clientName,
        embarkPoint: response.order.embarkPoint,
        embarkPointMunicipio: response.order.embarkPointMunicipio ?? "",
        embarkPointUf: stateNameFromValue(response.order.embarkPointUf),
        embarkPointNeedsCreate: response.order.embarkPointNeedsCreate,
        destination: response.order.destination,
        destinationMunicipio: response.order.destinationMunicipio ?? "",
        destinationUf: stateNameFromValue(response.order.destinationUf),
        destinationNeedsCreate: response.order.destinationNeedsCreate,
        product: response.order.product,
        contractNumber: response.order.contractNumber ?? "",
        lotKg: kgFormatter.format(response.order.lotKg),
        classifierName: response.order.classifierName ?? "",
        producerName: response.order.producerName ?? "",
        notes: response.order.notes ?? "",
      });
      await Promise.all([load(1), loadFacets()]);
      setPage(1);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar O.S.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (order: ServiceOrderDraft) => {
    setForm({
      id: order.id,
      requestedDate: order.requestedDate,
      clientName: order.clientName,
      embarkPoint: order.embarkPoint,
      embarkPointMunicipio: order.embarkPointMunicipio ?? "",
      embarkPointUf: stateNameFromValue(order.embarkPointUf),
      embarkPointNeedsCreate: order.embarkPointNeedsCreate,
      destination: order.destination,
      destinationMunicipio: order.destinationMunicipio ?? "",
      destinationUf: stateNameFromValue(order.destinationUf),
      destinationNeedsCreate: order.destinationNeedsCreate,
      product: order.product,
      contractNumber: order.contractNumber ?? "",
      lotKg: kgFormatter.format(order.lotKg),
      classifierName: order.classifierName ?? "",
      producerName: order.producerName ?? "",
      notes: order.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const queue = async (order: ServiceOrderDraft) => {
    try {
      await apiJson(`/api/service-orders/${order.id}/queue`, { method: "POST" });
      toast.success("O.S. colocada na fila de envio.");
      await load(page);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao colocar na fila.");
    }
  };

  const processQueue = async () => {
    setProcessing(true);
    try {
      const response = await apiJson<{
        processed: number;
        created: number;
        failed: number;
      }>("/api/service-orders/process-queue", {
        method: "POST",
        body: { limit: 3 },
      });
      if (response.failed) {
        toast.error(
          `Fila processada: ${response.created} criada(s), ${response.failed} com erro.`
        );
      } else {
        toast.success(`Fila processada: ${response.created} O.S. criada(s).`);
      }
      await load(page);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao processar fila.");
    } finally {
      setProcessing(false);
    }
  };

  const remove = async (order: ServiceOrderDraft) => {
    if (!window.confirm(`Excluir a O.S. ${order.referenceCode}?`)) return;
    try {
      await apiJson(`/api/service-orders/${order.id}`, { method: "DELETE" });
      toast.success("O.S. excluída.");
      await load(page);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir O.S.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.2em] text-app-faint">Operação</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ordens de Serviços</h1>
        <p className="mt-2 max-w-[840px] text-sm text-app-soft">
          Monte a ordem com cliente, embarque, destino e classificador já cadastrados no Classific.
          Se embarque ou destino forem novos, marque para cadastrar antes da O.S.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Solicitações" value={String(summary.total)} detail="O.S. locais" icon={<ClipboardList className="h-4 w-4 text-app-muted" />} />
        <StatCard label="Rascunhos" value={String(summary.draft)} detail="Na página atual" accent="blue" icon={<Pencil className="h-4 w-4 text-app-muted" />} />
        <StatCard label="Fila de envio" value={String(summary.queued)} detail="Aguardando envio" accent="amber" icon={<Clock3 className="h-4 w-4 text-app-muted" />} />
        <StatCard label="Criadas" value={String(summary.created)} detail="Confirmadas" accent="green" icon={<Send className="h-4 w-4 text-app-muted" />} />
      </div>

      <ChartCard title={form.id ? "Editar O.S." : "Nova O.S."} subtitle="Espelha o fluxo do Classific: cadastros existentes, lote, contrato e classificador">
        <form className="space-y-5" onSubmit={(event) => save(event).catch(() => undefined)}>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Data" type="date" value={form.requestedDate} onChange={(value) => setForm((prev) => ({ ...prev, requestedDate: value }))} required />
            <SelectField label="Cliente" value={form.clientName} onChange={(value) => setForm((prev) => ({ ...prev, clientName: value }))} required>
              <option value="">Selecione...</option>
              {clientOptions.map((client) => (
                <option key={client} value={client}>{client}</option>
              ))}
            </SelectField>
            <SelectField label="Produto" value={form.product} onChange={(value) => setForm((prev) => ({ ...prev, product: value }))} required>
              <option value="">Selecione...</option>
              {productOptions.map((product) => (
                <option key={product} value={product}>{product}</option>
              ))}
            </SelectField>
            <SelectField label="Classificador" value={form.classifierName} onChange={(value) => setForm((prev) => ({ ...prev, classifierName: value }))} required>
              <option value="">Selecione...</option>
              {classifierOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <PlaceSelector
              label="Embarque"
              value={form.embarkPoint}
              municipio={form.embarkPointMunicipio}
              uf={form.embarkPointUf}
              needsCreate={form.embarkPointNeedsCreate}
              options={facets.embarks}
              createLabel="Novo embarque"
              onSelect={(option) =>
                setForm((prev) => ({
                  ...prev,
                  embarkPoint: option.name,
                  embarkPointMunicipio: option.municipio ?? "",
                  embarkPointUf: stateNameFromValue(option.uf),
                  embarkPointNeedsCreate: false,
                }))
              }
              onChange={(patch) => {
                if (Object.keys(patch).length === 0) startNewEmbark();
                else setForm((prev) => ({ ...prev, ...patch }));
              }}
            />
            <PlaceSelector
              label="Destino"
              value={form.destination}
              municipio={form.destinationMunicipio}
              uf={form.destinationUf}
              needsCreate={form.destinationNeedsCreate}
              options={facets.destinations}
              createLabel="Novo destino"
              onSelect={(option) =>
                setForm((prev) => ({
                  ...prev,
                  destination: option.name,
                  destinationMunicipio: option.municipio ?? "",
                  destinationUf: stateNameFromValue(option.uf),
                  destinationNeedsCreate: false,
                }))
              }
              onChange={(patch) => {
                if (Object.keys(patch).length === 0) startNewDestination();
                else setForm((prev) => ({ ...prev, ...patch }));
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Contrato" value={form.contractNumber} onChange={(value) => setForm((prev) => ({ ...prev, contractNumber: value }))} placeholder="Opcional" />
            <Field label="Lote (kg)" value={form.lotKg} onChange={(value) => setForm((prev) => ({ ...prev, lotKg: formatKgInput(value) }))} placeholder="Ex.: 1.200.000" required />
            <Field label="Produtor" value={form.producerName} onChange={(value) => setForm((prev) => ({ ...prev, producerName: value }))} placeholder="Opcional" />
            <Field label="Observações" value={form.notes} onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))} placeholder="Instruções para o envio" />
          </div>

          <div className="rounded-2xl bg-emerald-500/10 p-4 text-sm text-emerald-900 ring-1 ring-emerald-500/20 dark:text-emerald-100">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Fluxo de envio:</strong> se embarque ou destino estiver como novo, o sistema deve
                cadastrar primeiro em Pontos de Embarque/Destinos e depois criar a O.S. com cliente,
                produto, lote e classificador selecionados.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={reset} className="inline-flex h-10 items-center rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover">
              Limpar
            </button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40">
              <Plus className="h-4 w-4" />
              Salvar rascunho
            </button>
            <button type="button" disabled={saving} onClick={() => save(undefined, "pendente_envio").catch(() => undefined)} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-sm text-emerald-800 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-100">
              <UploadCloud className="h-4 w-4" />
              Salvar e enviar
            </button>
          </div>
        </form>
      </ChartCard>

      <ChartCard
        title="Histórico de O.S."
        subtitle="Rascunhos e solicitações aguardando criação no Classific"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={processQueue}
              disabled={processing || summary.queued <= 0}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-sm text-emerald-800 ring-1 ring-emerald-500/25 transition hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-100"
            >
              <ClipboardCheck className={cn("h-4 w-4", processing ? "animate-pulse" : "")} />
              Processar fila
            </button>
            <button type="button" onClick={() => load(page).catch(() => undefined)} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40">
              <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
              Recarregar
            </button>
          </div>
        }
      >
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar por cliente, origem, destino, referência..." className="h-11 w-full rounded-2xl bg-surface-soft pl-11 pr-4 text-sm outline-none ring-1 ring-app focus:ring-app-strong" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value as "" | OsStatus)} className="h-11 rounded-2xl bg-surface-soft px-4 text-sm outline-none ring-1 ring-app focus:ring-app-strong">
            <option value="">Todos status</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button type="button" onClick={() => { setPage(1); load(1).catch(() => undefined); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover">
            <Search className="h-4 w-4" />
            Buscar
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl ring-1 ring-app">
          <div className="overflow-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-table-head text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Referência</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Embarque</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3">Classificador</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Lote</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {loading ? (
                  <tr><td className="px-4 py-6 text-app-soft" colSpan={10}>Carregando...</td></tr>
                ) : items.length ? (
                  items.map((order) => (
                    <tr key={order.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3 font-mono text-app-muted">
                        <div>{order.referenceCode}</div>
                        {order.classificOsId ? <div className="text-xs text-emerald-700 dark:text-emerald-200">Classific: {order.classificOsId}</div> : null}
                      </td>
                      <td className="px-4 py-3 font-mono">{order.requestedDate}</td>
                      <td className="px-4 py-3">{order.clientName}</td>
                      <td className="px-4 py-3 text-app-muted">
                        <div>{order.embarkPoint}</div>
                        {order.embarkPointNeedsCreate ? <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-100">Cadastrar</span> : null}
                      </td>
                      <td className="px-4 py-3 text-app-muted">
                        <div>{order.destination}</div>
                        {order.destinationNeedsCreate ? <span className="mt-1 inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-100">Cadastrar</span> : null}
                      </td>
                      <td className="px-4 py-3 text-app-muted">{order.classifierName ?? "-"}</td>
                      <td className="px-4 py-3 text-app-muted">{order.contractNumber ?? "-"}</td>
                      <td className="px-4 py-3 font-mono">{kgFormatter.format(order.lotKg)} kg</td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex rounded-full px-3 py-1 text-xs ring-1", statusClass[order.status])}>{statusLabels[order.status]}</span>
                        {order.botError ? <div className="mt-1 text-xs text-rose-700 dark:text-rose-200">{order.botError}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => edit(order)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover" title="Editar" aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => queue(order)} disabled={order.status === "pendente_envio" || order.status === "criada"} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20 transition hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-100" title="Colocar na fila de envio" aria-label="Colocar na fila de envio">
                            <UploadCloud className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => remove(order)} className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-800 ring-1 ring-rose-500/20 transition hover:bg-rose-500/20 dark:text-rose-200" title="Excluir" aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td className="px-4 py-6 text-app-soft" colSpan={10}>Nenhuma O.S. cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-app-soft">
          <div>{total} O.S. · página {page} de {totalPages}</div>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => { const next = Math.max(1, page - 1); setPage(next); load(next).catch(() => undefined); }} className="h-9 rounded-xl bg-surface-soft px-3 ring-1 ring-app disabled:opacity-40">Anterior</button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => { const next = Math.min(totalPages, page + 1); setPage(next); load(next).catch(() => undefined); }} className="h-9 rounded-xl bg-surface-soft px-3 ring-1 ring-app disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
