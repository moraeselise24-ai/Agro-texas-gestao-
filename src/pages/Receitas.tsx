import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import FitValue from "@/components/FitValue";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";
import { formatMoneyInput, formatMoneyValue } from "@/utils/money";

type RevenueStatus = "prevista" | "a_receber" | "recebida" | "cancelada";
type RecurrenceFrequency = "semanal" | "mensal" | "anual";
type DateBasis = "date" | "due" | "expected" | "received";

type RevenueCategory = {
  id: string;
  name: string;
  active: boolean;
};

type Revenue = {
  id: string;
  date: string;
  category: string;
  clientName: string | null;
  description: string;
  amountBRL: number;
  paymentMethod: string | null;
  documentNumber: string | null;
  dueDate: string | null;
  expectedReceiptDate: string | null;
  receivedAt: string | null;
  status: RevenueStatus;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceUntil: string | null;
  notes: string | null;
};

const paymentMethods = ["Pix", "Cartão", "Dinheiro", "Boleto", "Transferência"];

const statusOptions: Array<{ value: RevenueStatus; label: string }> = [
  { value: "prevista", label: "Prevista" },
  { value: "a_receber", label: "A receber" },
  { value: "recebida", label: "Recebida" },
  { value: "cancelada", label: "Cancelada" },
];

const recurrenceOptions: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

const dateBasisOptions: Array<{ value: DateBasis; label: string }> = [
  { value: "date", label: "Receita lançada" },
  { value: "due", label: "Vencimento" },
  { value: "expected", label: "Receber em" },
  { value: "received", label: "Recebido em" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const monthStartIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);

const formatDate = (value: string | null): string => {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
};

const parseMoney = (value: string): number => {
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const statusLabel = (value: RevenueStatus): string =>
  statusOptions.find((s) => s.value === value)?.label ?? value;

const emptyForm = {
  date: todayIso(),
  category: "",
  clientName: "",
  description: "",
  amountBRL: "",
  paymentMethod: "",
  documentNumber: "",
  dueDate: "",
  expectedReceiptDate: "",
  receivedAt: "",
  status: "a_receber" as RevenueStatus,
  isRecurring: false,
  recurrenceFrequency: "mensal" as RecurrenceFrequency,
  recurrenceUntil: "",
  notes: "",
};

type RevenueForm = typeof emptyForm;

const Field = ({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) => (
  <label className="block">
    <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
      {label}
      {required ? <span className="ml-1 text-rose-700 dark:text-rose-300">*</span> : null}
    </div>
    <div className="mt-2">{children}</div>
  </label>
);

const inputClass = cn(
  "h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app",
  "outline-none ring-1 ring-app focus:ring-app-strong"
);

export default function Receitas({ embedded = false }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const [items, setItems] = useState<Revenue[]>([]);
  const [categories, setCategories] = useState<RevenueCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmountBRL, setTotalAmountBRL] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Revenue | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<RevenueCategory | null>(null);

  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<RevenueStatus | "all">("all");
  const [dateBasis, setDateBasis] = useState<DateBasis>("date");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState<RevenueForm>(emptyForm);

  const buildFilterParams = (includePaging = true) => {
    const params = new URLSearchParams({
      from,
      to,
    });
    if (includePaging) {
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
    }
    if (category !== "all") params.set("category", category);
    if (status !== "all") params.set("status", status);
    params.set("dateBasis", dateBasis);
    if (q.trim()) params.set("q", q.trim());
    return params;
  };

  const loadCategories = () => {
    apiGet<{ categories: RevenueCategory[] }>("/api/revenues/categories")
      .then((r) => {
        const next = r.categories ?? [];
        setCategories(next);
        setForm((prev) => ({
          ...prev,
          category: prev.category || next[0]?.name || "",
        }));
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar categorias")
      );
  };

  const load = () => {
    setLoading(true);
    apiGet<{ items: Revenue[]; total: number; totalAmountBRL: number }>(
      `/api/revenues?${buildFilterParams().toString()}`
    )
      .then((r) => {
        setItems(r.items ?? []);
        setTotal(r.total ?? 0);
        setTotalAmountBRL(r.totalAmountBRL ?? 0);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar receitas")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCategories();
    load();
  }, []);

  useEffect(() => {
    load();
  }, [from, to, category, status, dateBasis, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [from, to, category, status, dateBasis, pageSize]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      map.set(item.category, (map.get(item.category) ?? 0) + item.amountBRL);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  const receivableTotal = useMemo(
    () =>
      items
        .filter((item) => item.status === "prevista" || item.status === "a_receber")
        .reduce((acc, item) => acc + item.amountBRL, 0),
    [items]
  );

  const receivedTotal = useMemo(
    () =>
      items
        .filter((item) => item.status === "recebida")
        .reduce((acc, item) => acc + item.amountBRL, 0),
    [items]
  );

  const recurringCount = useMemo(
    () => items.filter((item) => item.isRecurring).length,
    [items]
  );

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, date: todayIso(), category: categories[0]?.name ?? "" });
  };

  const startEdit = (item: Revenue) => {
    setEditingId(item.id);
    setForm({
      date: item.date,
      category: item.category,
      clientName: item.clientName ?? "",
      description: item.description,
      amountBRL: formatMoneyValue(item.amountBRL),
      paymentMethod: item.paymentMethod ?? "",
      documentNumber: item.documentNumber ?? "",
      dueDate: item.dueDate ?? "",
      expectedReceiptDate: item.expectedReceiptDate ?? "",
      receivedAt: item.receivedAt ?? "",
      status: item.status,
      isRecurring: item.isRecurring,
      recurrenceFrequency: item.recurrenceFrequency ?? "mensal",
      recurrenceUntil: item.recurrenceUntil ?? "",
      notes: item.notes ?? "",
    });
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    setCreatingCategory(true);
    try {
      const r = await apiJson<{ category: RevenueCategory }>("/api/revenues/categories", {
        method: "POST",
        body: { name },
      });
      setCategories((prev) => {
        const filtered = prev.filter((c) => c.name !== r.category.name);
        return [...filtered, r.category].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      setForm((prev) => ({ ...prev, category: r.category.name }));
      setNewCategoryName("");
      toast.success("Categoria cadastrada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar categoria");
    } finally {
      setCreatingCategory(false);
    }
  };

  const removeCategory = async (item: RevenueCategory) => {
    setRemovingCategoryId(item.id);
    try {
      await apiJson(`/api/revenues/categories/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      toast.success("Categoria removida.");
      setCategories((prev) => prev.filter((c) => c.id !== item.id));
      setForm((prev) => ({
        ...prev,
        category: prev.category === item.name ? "" : prev.category,
      }));
      setCategory((prev) => (prev === item.name ? "all" : prev));
      setCategoryDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao remover categoria");
    } finally {
      setRemovingCategoryId(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amountBRL = parseMoney(form.amountBRL);
    if (!form.date || !form.category || !form.description.trim() || amountBRL <= 0) {
      toast.error("Preencha data, categoria, descrição e valor maior que zero.");
      return;
    }

    setSaving(true);
    const isOpenStatus = form.status === "prevista" || form.status === "a_receber";
    const payload = {
      ...form,
      amountBRL,
      dueDate: isOpenStatus ? form.dueDate : "",
      expectedReceiptDate: isOpenStatus ? form.expectedReceiptDate : "",
      receivedAt: form.status === "recebida" ? form.receivedAt || todayIso() : "",
    };
    try {
      await apiJson<{ revenue: Revenue }>(
        editingId ? `/api/revenues/${editingId}` : "/api/revenues",
        {
          method: editingId ? "PUT" : "POST",
          body: payload,
        }
      );
      toast.success(editingId ? "Receita atualizada." : "Receita lançada.");
      resetForm();
      loadCategories();
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar receita");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: Revenue) => {
    setDeletingId(item.id);
    try {
      await apiJson(`/api/revenues/${item.id}`, { method: "DELETE" });
      toast.success("Receita excluída.");
      setItems((prev) => prev.filter((revenue) => revenue.id !== item.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setTotalAmountBRL((prev) => Math.max(0, prev - item.amountBRL));
      if (editingId === item.id) resetForm();
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir receita");
    } finally {
      setDeletingId(null);
    }
  };

  const showOpenReceiptDates = form.status === "prevista" || form.status === "a_receber";
  const showReceivedDate = form.status === "recebida";

  const exportFile = (format: "xlsx" | "pdf") => {
    const params = buildFilterParams(false);
    window.location.href = `/api/revenues/export/${format}?${params.toString()}`;
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const runSearch = () => {
    if (page === 1) {
      load();
      return;
    }
    setPage(1);
  };

  return (
    <>
      <div className="space-y-6">
        {!embedded ? (
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
                Financeiro
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Receitas
              </h1>
              <div className="mt-2 text-sm text-app-soft">
                Entradas, valores a receber e receitas recorrentes.
              </div>
            </div>
          </header>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
                  Total no período
                </div>
                <FitValue className="mt-3" maxRem={1.5} minRem={0.95} mono={false}>
                  {formatBRL(totalAmountBRL)}
                </FitValue>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-200">
                <Banknote className="h-5 w-5" />
              </span>
            </div>
          </div>
          <div className="rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
              A receber
            </div>
            <FitValue className="mt-3" maxRem={1.5} minRem={0.95} mono={false}>
              {formatBRL(receivableTotal)}
            </FitValue>
          </div>
          <div className="rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app">
            <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
              Recebido
            </div>
            <FitValue className="mt-3" maxRem={1.5} minRem={0.95} mono={false}>
              {formatBRL(receivedTotal)}
            </FitValue>
          </div>
          <div className="rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
                  Recorrentes
                </div>
                <FitValue className="mt-3" maxRem={1.5} minRem={0.95} mono={false}>
                  {recurringCount}
                </FitValue>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/10 text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-200">
                <Repeat className="h-5 w-5" />
              </span>
            </div>
          </div>
        </div>

        <ChartCard title="Categorias" subtitle="Organize as entradas por origem de receita.">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createCategory();
              }}
              placeholder="Nova categoria"
              className={inputClass}
            />
            <button
              type="button"
              disabled={creatingCategory || !newCategoryName.trim()}
              onClick={createCategory}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Cadastrar
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-2 rounded-full bg-surface-soft px-3 py-1 text-xs text-app-muted ring-1 ring-app"
              >
                {c.name}
                <button
                  type="button"
                  disabled={removingCategoryId === c.id}
                  onClick={() => setCategoryDeleteTarget(c)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-50 dark:hover:text-rose-200"
                  aria-label={`Remover categoria ${c.name}`}
                  title="Remover categoria"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          title={editingId ? "Editar receita" : "Nova receita"}
          subtitle="Entrada operacional, valor a receber ou recorrência."
          actions={
            editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app transition hover:bg-surface-hover"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
            ) : null
          }
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Field label="Data da receita" required>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Categoria" required>
                <select
                  value={form.category}
                  onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Selecione...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Valor" required>
                <input
                  value={form.amountBRL}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, amountBRL: formatMoneyInput(e.target.value) }))
                  }
                  placeholder="0,00"
                  inputMode="decimal"
                  className={inputClass}
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as RevenueStatus;
                    setForm((v) => ({
                      ...v,
                      status: nextStatus,
                      dueDate:
                        nextStatus === "prevista" || nextStatus === "a_receber" ? v.dueDate : "",
                      expectedReceiptDate:
                        nextStatus === "prevista" || nextStatus === "a_receber"
                          ? v.expectedReceiptDate
                          : "",
                      receivedAt: nextStatus === "recebida" ? v.receivedAt || todayIso() : "",
                    }));
                  }}
                  className={inputClass}
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Descrição" required>
                <input
                  value={form.description}
                  onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                  placeholder="Ex.: faturamento OS, reembolso, contrato"
                  className={inputClass}
                />
              </Field>
              <Field label="Cliente">
                <input
                  value={form.clientName}
                  onChange={(e) => setForm((v) => ({ ...v, clientName: e.target.value }))}
                  placeholder="Nome do cliente"
                  className={inputClass}
                />
              </Field>
              <Field label="Documento">
                <input
                  value={form.documentNumber}
                  onChange={(e) => setForm((v) => ({ ...v, documentNumber: e.target.value }))}
                  placeholder="NF, recibo, OS..."
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {showOpenReceiptDates ? (
                <>
                  <Field label="Vencimento">
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((v) => ({ ...v, dueDate: e.target.value }))}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Receber em">
                    <input
                      type="date"
                      value={form.expectedReceiptDate}
                      onChange={(e) =>
                        setForm((v) => ({ ...v, expectedReceiptDate: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                </>
              ) : null}
              {showReceivedDate ? (
                <Field label="Recebido em">
                  <input
                    type="date"
                    value={form.receivedAt}
                    onChange={(e) => setForm((v) => ({ ...v, receivedAt: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
              ) : null}
              <Field label="Recebimento">
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm((v) => ({ ...v, paymentMethod: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Não informado</option>
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_1fr_180px]">
              <label className="flex h-11 items-center gap-3 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm((v) => ({ ...v, isRecurring: e.target.checked }))}
                  className="h-4 w-4"
                />
                Recorrente
              </label>
              <Field label="Frequência">
                <select
                  value={form.recurrenceFrequency}
                  disabled={!form.isRecurring}
                  onChange={(e) =>
                    setForm((v) => ({
                      ...v,
                      recurrenceFrequency: e.target.value as RecurrenceFrequency,
                    }))
                  }
                  className={cn(inputClass, !form.isRecurring && "opacity-50")}
                >
                  {recurrenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Recorre até">
                <input
                  type="date"
                  value={form.recurrenceUntil}
                  disabled={!form.isRecurring}
                  onChange={(e) => setForm((v) => ({ ...v, recurrenceUntil: e.target.value }))}
                  className={cn(inputClass, !form.isRecurring && "opacity-50")}
                />
              </Field>
            </div>

            <Field label="Observações">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
                rows={3}
                className={cn(inputClass, "h-auto py-3")}
              />
            </Field>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-2xl px-5 text-sm font-medium",
                  "bg-emerald-500 text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                )}
              >
                <Plus className="h-4 w-4" />
                {saving ? "Salvando..." : editingId ? "Salvar alteração" : "Lançar receita"}
              </button>
            </div>
          </form>
        </ChartCard>

        <ChartCard
          title="Registros"
          subtitle="Receitas, recorrências e valores a receber no período."
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
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[170px_150px_150px_190px_150px_1fr_auto]">
            <select
              value={dateBasis}
              onChange={(e) => setDateBasis(e.target.value as DateBasis)}
              className={inputClass}
            >
              {dateBasisOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              <option value="all">Todas categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RevenueStatus | "all")}
              className={inputClass}
            >
              <option value="all">Todos status</option>
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
                placeholder="Buscar por descrição, cliente, documento..."
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
              <table className="w-full min-w-[1250px] text-left text-sm">
                <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                  <tr>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Venc.</th>
                    <th className="px-4 py-3">Receber em</th>
                    <th className="px-4 py-3">Recebimento</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-app-soft">
                        Carregando...
                      </td>
                    </tr>
                  ) : items.length ? (
                    items.map((item) => (
                      <tr key={item.id} className="transition hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono">{formatDate(item.date)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-1 text-xs ring-1 ring-app">
                            {item.status === "recebida" ? <CheckCircle2 className="h-3 w-3" /> : null}
                            {statusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.category}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.description}</div>
                          <div className="mt-1 text-xs text-app-soft">
                            {[item.clientName, item.documentNumber, item.isRecurring ? `Recorrente ${item.recurrenceFrequency ?? ""}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-app-soft">{formatDate(item.dueDate)}</td>
                        <td className="px-4 py-3 font-mono text-app-soft">
                          {formatDate(item.expectedReceiptDate)}
                        </td>
                        <td className="px-4 py-3 text-app-soft">{item.paymentMethod ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {formatBRL(item.amountBRL)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === item.id}
                              onClick={() => setDeleteTarget(item)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft text-rose-700 ring-1 ring-app transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-200"
                              aria-label="Excluir"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-app-soft">
                        Nenhuma receita encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 text-xs text-app-soft">
            {total} registro(s). Maior categoria: {categoryTotals[0]?.label ?? "—"}.
          </div>
          <div className="mt-4 flex flex-col gap-3 text-sm text-app-soft md:flex-row md:items-center md:justify-between">
            <div>
              Página {Math.min(page, totalPages)} de {totalPages}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-9 rounded-xl bg-surface-soft px-3 text-sm ring-1 ring-app outline-none"
              >
                <option value={10}>10 por página</option>
                <option value={25}>25 por página</option>
                <option value={50}>50 por página</option>
                <option value={100}>100 por página</option>
              </select>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </ChartCard>
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-app-panel p-5 shadow-app ring-1 ring-app-strong">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
                  Excluir receita
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-tight">
                  Confirmar exclusão
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-surface-soft p-4 ring-1 ring-app">
              <div className="text-sm font-medium">{deleteTarget.description}</div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-app-soft">
                <div>
                  <div className="uppercase tracking-[0.14em] text-app-faint">Categoria</div>
                  <div className="mt-1 text-app-muted">{deleteTarget.category}</div>
                </div>
                <div>
                  <div className="uppercase tracking-[0.14em] text-app-faint">Valor</div>
                  <div className="mt-1 font-mono text-app-muted">
                    {formatBRL(deleteTarget.amountBRL)}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm text-app-soft">
              Essa ação remove o lançamento da lista de receitas.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-surface-soft px-5 text-sm ring-1 ring-app transition hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingId === deleteTarget.id}
                onClick={() => remove(deleteTarget)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId === deleteTarget.id ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryDeleteTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-app-overlay px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-app-panel p-5 shadow-app ring-1 ring-app-strong">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
                  Remover categoria
                </div>
                <h2 className="mt-2 text-lg font-semibold tracking-tight">
                  {categoryDeleteTarget.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCategoryDeleteTarget(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-app-soft">
              A categoria sai da lista de seleção, mas receitas antigas lançadas com ela continuam preservadas.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCategoryDeleteTarget(null)}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-surface-soft px-5 text-sm ring-1 ring-app transition hover:bg-surface-hover"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removingCategoryId === categoryDeleteTarget.id}
                onClick={() => removeCategory(categoryDeleteTarget)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 text-sm font-medium text-white transition hover:bg-rose-400 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {removingCategoryId === categoryDeleteTarget.id ? "Removendo..." : "Remover"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
