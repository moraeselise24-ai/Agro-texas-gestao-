import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  Boxes,
  CalendarClock,
  MapPin,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import StatCard from "@/components/StatCard";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";
import { formatMoneyInput, formatMoneyValue } from "@/utils/money";

type AssetStatus = "ativo" | "manutencao" | "emprestado" | "baixado" | "vendido" | "perdido";
type AssetCondition = "novo" | "bom" | "regular" | "critico";

type Asset = {
  id: string;
  code: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  responsibleName: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  acquisitionDate: string | null;
  acquisitionValueBRL: number;
  usefulLifeMonths: number | null;
  currentValueBRL: number;
  warrantyUntil: string | null;
  nextMaintenanceDate: string | null;
  disposalDate: string | null;
  disposalReason: string | null;
  notes: string | null;
};

type AssetSummary = {
  total: number;
  active: number;
  maintenance: number;
  critical: number;
  acquisitionValueBRL: number;
  currentValueBRL: number;
  upcomingMaintenance: number;
  warrantyExpiring: number;
};

type FormState = {
  id: string | null;
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  serialNumber: string;
  location: string;
  responsibleName: string;
  status: AssetStatus;
  condition: AssetCondition;
  acquisitionDate: string;
  acquisitionValueBRL: string;
  usefulLifeMonths: string;
  warrantyUntil: string;
  nextMaintenanceDate: string;
  notes: string;
};

const initialForm: FormState = {
  id: null,
  code: "",
  name: "",
  category: "",
  brand: "",
  model: "",
  serialNumber: "",
  location: "",
  responsibleName: "",
  status: "ativo",
  condition: "bom",
  acquisitionDate: "",
  acquisitionValueBRL: "",
  usefulLifeMonths: "",
  warrantyUntil: "",
  nextMaintenanceDate: "",
  notes: "",
};

const statusLabels: Record<AssetStatus, string> = {
  ativo: "Ativo",
  manutencao: "Manutenção",
  emprestado: "Emprestado",
  baixado: "Baixado",
  vendido: "Vendido",
  perdido: "Perdido",
};

const conditionLabels: Record<AssetCondition, string> = {
  novo: "Novo",
  bom: "Bom",
  regular: "Regular",
  critico: "Crítico",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const parseMoney = (value: string): number => {
  const clean = value.replace(/[^\d,.-]/g, "");
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
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

const OptionField = ({
  label,
  value,
  options,
  onChange,
  onCreate,
  onDelete,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onCreate: () => void;
  onDelete: () => void;
  placeholder?: string;
  required?: boolean;
}) => {
  const visibleOptions = value && !options.includes(value) ? [...options, value] : options;
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
        {label}
        {required ? <span className="ml-1 text-rose-700 dark:text-rose-300">*</span> : null}
      </div>
      <div className="mt-2 flex gap-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          className="h-11 min-w-0 flex-1 rounded-2xl bg-surface-soft px-4 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong"
        >
          <option value="">{placeholder ?? `Selecione ${label.toLowerCase()}`}</option>
          {visibleOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
          aria-label={`Cadastrar ${label}`}
          title={`Cadastrar ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!value}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-800 ring-1 ring-rose-500/20 transition hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-200"
          aria-label={`Apagar ${label}`}
          title={`Apagar ${label} selecionado`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
};

export default function Patrimonio() {
  const toast = useToast();
  const [items, setItems] = useState<Asset[]>([]);
  const [summary, setSummary] = useState<AssetSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const pageSize = 12;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (location) params.set("location", location);

    Promise.all([
      apiGet<{ items: Asset[]; total: number }>(`/api/assets?${params.toString()}`),
      apiGet<{ summary: AssetSummary }>("/api/assets/summary"),
      apiGet<{ categories: string[]; brands: string[]; models: string[]; locations: string[] }>("/api/assets/facets"),
    ])
      .then(([list, summaryResult, facets]) => {
        setItems(list.items);
        setTotal(list.total);
        setSummary(summaryResult.summary);
        setCategories(facets.categories);
        setBrands(facets.brands);
        setModels(facets.models);
        setLocations(facets.locations);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "Falha ao carregar patrimônio");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [page]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.code || !form.name || !form.category) return;
    setSaving(true);
    const payload = {
      ...form,
      acquisitionValueBRL: parseMoney(form.acquisitionValueBRL),
      usefulLifeMonths: form.usefulLifeMonths ? Number(form.usefulLifeMonths) : null,
      acquisitionDate: form.acquisitionDate || null,
      warrantyUntil: form.warrantyUntil || null,
      nextMaintenanceDate: form.nextMaintenanceDate || null,
    };
    try {
      if (form.id) {
        await apiJson(`/api/assets/${form.id}`, { method: "PUT", body: payload });
        toast.success("Patrimônio atualizado.");
      } else {
        await apiJson("/api/assets", { method: "POST", body: payload });
        toast.success("Patrimônio cadastrado.");
      }
      setForm(initialForm);
      setPage(1);
      load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar patrimônio");
    } finally {
      setSaving(false);
    }
  };

  const createOption = async (type: "category" | "brand" | "model") => {
    const label = type === "category" ? "categoria" : type === "brand" ? "marca" : "modelo";
    const name = window.prompt(`Nome da nova ${label}:`);
    if (name === null) return;
    const clean = name.trim();
    if (!clean) return;
    try {
      await apiJson(`/api/assets/options/${type}`, {
        method: "POST",
        body: { name: clean },
      });
      if (type === "category") setCategories((prev) => [...new Set([...prev, clean])].sort((a, b) => a.localeCompare(b)));
      if (type === "brand") setBrands((prev) => [...new Set([...prev, clean])].sort((a, b) => a.localeCompare(b)));
      if (type === "model") setModels((prev) => [...new Set([...prev, clean])].sort((a, b) => a.localeCompare(b)));
      if (type === "category") setForm((prev) => ({ ...prev, category: clean }));
      if (type === "brand") setForm((prev) => ({ ...prev, brand: clean }));
      if (type === "model") setForm((prev) => ({ ...prev, model: clean }));
      toast.success(`${type === "category" ? "Categoria" : type === "brand" ? "Marca" : "Modelo"} cadastrado.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao cadastrar opção");
    }
  };

  const deleteOption = async (type: "category" | "brand" | "model", name: string) => {
    const clean = name.trim();
    if (!clean) return;
    const label = type === "category" ? "categoria" : type === "brand" ? "marca" : "modelo";
    const ok = window.confirm(`Apagar ${label} "${clean}" da lista de seleção? Os patrimônios já cadastrados não serão apagados.`);
    if (!ok) return;
    try {
      await apiJson(`/api/assets/options/${type}/${encodeURIComponent(clean)}`, {
        method: "DELETE",
      });
      if (type === "category") {
        setCategories((prev) => prev.filter((item) => item !== clean));
        setForm((prev) => ({ ...prev, category: prev.category === clean ? "" : prev.category }));
      }
      if (type === "brand") {
        setBrands((prev) => prev.filter((item) => item !== clean));
        setForm((prev) => ({ ...prev, brand: prev.brand === clean ? "" : prev.brand }));
      }
      if (type === "model") {
        setModels((prev) => prev.filter((item) => item !== clean));
        setForm((prev) => ({ ...prev, model: prev.model === clean ? "" : prev.model }));
      }
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} removido da seleção.`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao apagar opção");
    }
  };

  const edit = (asset: Asset) => {
    setForm({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      category: asset.category,
      brand: asset.brand ?? "",
      model: asset.model ?? "",
      serialNumber: asset.serialNumber ?? "",
      location: asset.location ?? "",
      responsibleName: asset.responsibleName ?? "",
      status: asset.status,
      condition: asset.condition,
      acquisitionDate: asset.acquisitionDate ?? "",
      acquisitionValueBRL: formatMoneyValue(asset.acquisitionValueBRL),
      usefulLifeMonths: asset.usefulLifeMonths ? String(asset.usefulLifeMonths) : "",
      warrantyUntil: asset.warrantyUntil ?? "",
      nextMaintenanceDate: asset.nextMaintenanceDate ?? "",
      notes: asset.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dispose = async (asset: Asset) => {
    const reason = window.prompt(`Motivo da baixa de ${asset.code} - ${asset.name}:`);
    if (reason === null) return;
    try {
      await apiJson(`/api/assets/${asset.id}/dispose`, {
        method: "POST",
        body: { status: "baixado", reason },
      });
      toast.success("Patrimônio baixado.");
      load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao baixar patrimônio");
    }
  };

  const remove = async (asset: Asset) => {
    if (!window.confirm(`Excluir ${asset.code} - ${asset.name}?`)) return;
    try {
      await apiJson(`/api/assets/${asset.id}`, { method: "DELETE" });
      toast.success("Patrimônio excluído.");
      load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir patrimônio");
    }
  };

  const inactiveCount = useMemo(
    () => (summary ? summary.total - summary.active - summary.maintenance : 0),
    [summary]
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">Controle</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Patrimônio</h1>
          <div className="mt-2 max-w-3xl text-sm text-app-soft">
            Cadastro e acompanhamento de bens da operação: responsável, localização, estado,
            manutenção, garantia, valor e baixa patrimonial.
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Bens cadastrados" value={String(summary?.total ?? 0)} detail={`${summary?.active ?? 0} ativos`} icon={<Boxes className="h-4 w-4 text-app-muted" />} accent="blue" />
        <StatCard label="Valor atual" value={brl.format(summary?.currentValueBRL ?? 0)} detail={`Aquisição ${brl.format(summary?.acquisitionValueBRL ?? 0)}`} icon={<ShieldCheck className="h-4 w-4 text-app-muted" />} accent="green" />
        <StatCard label="Manutenção" value={String(summary?.maintenance ?? 0)} detail={`${summary?.upcomingMaintenance ?? 0} próximas em 30 dias`} icon={<Wrench className="h-4 w-4 text-app-muted" />} accent="amber" />
        <StatCard label="Atenção" value={String((summary?.critical ?? 0) + inactiveCount)} detail={`${summary?.warrantyExpiring ?? 0} garantias vencendo`} icon={<CalendarClock className="h-4 w-4 text-app-muted" />} accent="blue" />
      </div>

      <ChartCard title={form.id ? "Editar bem" : "Novo bem"} subtitle="Use código ou plaqueta para identificar cada item de forma única.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Código / plaqueta" value={form.code} onChange={(code) => setForm({ ...form, code })} placeholder="Ex.: NOTE-001" required />
            <Field label="Nome do bem" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="Notebook, veículo, impressora..." required />
            <OptionField label="Categoria" value={form.category} options={categories} onChange={(category) => setForm({ ...form, category })} onCreate={() => void createOption("category")} onDelete={() => void deleteOption("category", form.category)} placeholder="Selecione uma categoria" required />
            <OptionField label="Marca" value={form.brand} options={brands} onChange={(brand) => setForm({ ...form, brand })} onCreate={() => void createOption("brand")} onDelete={() => void deleteOption("brand", form.brand)} placeholder="Selecione uma marca" />
            <OptionField label="Modelo" value={form.model} options={models} onChange={(model) => setForm({ ...form, model })} onCreate={() => void createOption("model")} onDelete={() => void deleteOption("model", form.model)} placeholder="Selecione um modelo" />
            <Field label="Nº série / chassi" value={form.serialNumber} onChange={(serialNumber) => setForm({ ...form, serialNumber })} />
            <Field label="Localização" value={form.location} onChange={(location) => setForm({ ...form, location })} placeholder="Escritório, filial, fazenda..." />
            <Field label="Responsável" value={form.responsibleName} onChange={(responsibleName) => setForm({ ...form, responsibleName })} />
            <label className="block">
              <div className="text-xs uppercase tracking-[0.16em] text-app-soft">Status</div>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AssetStatus })} className="mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app outline-none ring-1 ring-app">
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="text-xs uppercase tracking-[0.16em] text-app-soft">Estado</div>
              <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value as AssetCondition })} className="mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app outline-none ring-1 ring-app">
                {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <Field label="Aquisição" type="date" value={form.acquisitionDate} onChange={(acquisitionDate) => setForm({ ...form, acquisitionDate })} />
            <Field label="Valor aquisição" value={form.acquisitionValueBRL} onChange={(value) => setForm({ ...form, acquisitionValueBRL: formatMoneyInput(value) })} placeholder="0,00" />
            <Field label="Vida útil (meses)" type="number" value={form.usefulLifeMonths} onChange={(usefulLifeMonths) => setForm({ ...form, usefulLifeMonths })} placeholder="Ex.: 60" />
            <Field label="Garantia até" type="date" value={form.warrantyUntil} onChange={(warrantyUntil) => setForm({ ...form, warrantyUntil })} />
            <Field label="Próx. manutenção" type="date" value={form.nextMaintenanceDate} onChange={(nextMaintenanceDate) => setForm({ ...form, nextMaintenanceDate })} />
          </div>
          <label className="block">
            <div className="text-xs uppercase tracking-[0.16em] text-app-soft">Observações</div>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="mt-2 min-h-[88px] w-full rounded-2xl bg-surface-soft px-4 py-3 text-sm text-app outline-none ring-1 ring-app focus:ring-app-strong" />
          </label>
          <div className="flex justify-end gap-2">
            {form.id ? (
              <button type="button" onClick={() => setForm(initialForm)} className="inline-flex h-10 items-center rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover">
                Cancelar
              </button>
            ) : null}
            <button type="submit" disabled={saving || !form.code || !form.name || !form.category} className="inline-flex h-10 items-center rounded-2xl bg-emerald-500/15 px-4 text-sm text-emerald-800 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:opacity-40 dark:text-emerald-200">
              {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Cadastrar bem"}
            </button>
          </div>
        </form>
      </ChartCard>

      <ChartCard title="Bens cadastrados" subtitle={loading ? "Carregando..." : `${total} item(ns)`}>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_180px_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Buscar por código, nome, série, responsável..." className="h-11 w-full rounded-2xl bg-surface-soft pl-11 pr-4 text-sm outline-none ring-1 ring-app" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-2xl bg-surface-soft px-4 text-sm outline-none ring-1 ring-app">
            <option value="">Todos status</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 rounded-2xl bg-surface-soft px-4 text-sm outline-none ring-1 ring-app">
            <option value="">Categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={location} onChange={(event) => setLocation(event.target.value)} className="h-11 rounded-2xl bg-surface-soft px-4 text-sm outline-none ring-1 ring-app">
            <option value="">Locais</option>
            {locations.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button type="button" onClick={() => { setPage(1); load(); }} className="h-11 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover">
            Buscar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-app-soft">
              <tr>
                <th className="px-3 py-2 font-medium">Bem</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Local</th>
                <th className="px-3 py-2 font-medium">Responsável</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Valor atual</th>
                <th className="px-3 py-2 font-medium">Manutenção</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-app">
              {items.map((asset) => (
                <tr key={asset.id} className="hover:bg-surface-hover">
                  <td className="px-3 py-3">
                    <div className="font-mono font-semibold">{asset.code}</div>
                    <div className="mt-1 text-app">{asset.name}</div>
                    <div className="mt-1 text-xs text-app-faint">{[asset.brand, asset.model, asset.serialNumber].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-app-muted">{asset.category}</td>
                  <td className="px-3 py-3 text-app-muted">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {asset.location ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-app-muted">{asset.responsibleName ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-full px-2 py-1 text-xs ring-1", asset.status === "ativo" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-200" : asset.status === "manutencao" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-200" : "bg-surface-soft text-app-muted ring-app")}>
                      {statusLabels[asset.status]} · {conditionLabels[asset.condition]}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-app-muted">{brl.format(asset.currentValueBRL)}</td>
                  <td className="px-3 py-3 text-app-muted">{formatDate(asset.nextMaintenanceDate)}</td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => edit(asset)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-xs ring-1 ring-app transition hover:bg-surface-hover">
                        <Pencil className="h-3.5 w-3.5" />
                        Editar
                      </button>
                      <button type="button" onClick={() => dispose(asset)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-amber-500/10 px-3 text-xs text-amber-800 ring-1 ring-amber-500/20 transition hover:bg-amber-500/20 dark:text-amber-200">
                        <Archive className="h-3.5 w-3.5" />
                        Baixa
                      </button>
                      <button type="button" onClick={() => remove(asset)} className="inline-flex h-9 items-center rounded-xl bg-rose-500/10 px-3 text-xs text-rose-800 ring-1 ring-rose-500/20 transition hover:bg-rose-500/20 dark:text-rose-200">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-app-soft">
                    Nenhum patrimônio encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-app-soft">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-9 rounded-xl bg-surface-soft px-3 ring-1 ring-app disabled:opacity-40">Anterior</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-9 rounded-xl bg-surface-soft px-3 ring-1 ring-app disabled:opacity-40">Próxima</button>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
