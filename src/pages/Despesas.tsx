import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Banknote,
  CalendarDays,
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

type ExpenseStatus = "agendada" | "a_pagar" | "paga" | "cancelada";
type RecurrenceFrequency = "semanal" | "mensal" | "anual";
type DateBasis = "date" | "due" | "scheduled" | "paid";

type ExpenseCategory = {
  id: string;
  name: string;
  active: boolean;
};

type Expense = {
  id: string;
  date: string;
  category: string;
  description: string;
  supplier: string | null;
  amountBRL: number;
  paymentMethod: string | null;
  documentNumber: string | null;
  dueDate: string | null;
  scheduledPaymentDate: string | null;
  paidAt: string | null;
  status: ExpenseStatus;
  isRecurring: boolean;
  recurrenceFrequency: RecurrenceFrequency | null;
  recurrenceUntil: string | null;
  notes: string | null;
  createdByName: string | null;
};

const paymentMethods = [
  "Pix",
  "Cartão",
  "Dinheiro",
  "Boleto",
  "Transferência",
  "Convênio",
];

const statusOptions: Array<{ value: ExpenseStatus; label: string }> = [
  { value: "agendada", label: "Agendada" },
  { value: "a_pagar", label: "A pagar" },
  { value: "paga", label: "Paga" },
  { value: "cancelada", label: "Cancelada" },
];

const recurrenceOptions: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "semanal", label: "Semanal" },
  { value: "mensal", label: "Mensal" },
  { value: "anual", label: "Anual" },
];

const dateBasisOptions: Array<{ value: DateBasis; label: string }> = [
  { value: "date", label: "Despesa feita" },
  { value: "due", label: "Vencimento" },
  { value: "scheduled", label: "Pagar em" },
  { value: "paid", label: "Pago em" },
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

const statusLabel = (value: ExpenseStatus): string =>
  statusOptions.find((s) => s.value === value)?.label ?? value;

const emptyForm = {
  date: todayIso(),
  category: "",
  description: "",
  supplier: "",
  amountBRL: "",
  paymentMethod: "",
  documentNumber: "",
  dueDate: "",
  scheduledPaymentDate: "",
  paidAt: "",
  status: "a_pagar" as ExpenseStatus,
  isRecurring: false,
  recurrenceFrequency: "mensal" as RecurrenceFrequency,
  recurrenceUntil: "",
  notes: "",
};

type ExpenseForm = typeof emptyForm;

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

export default function Despesas({ embedded = false }: { embedded?: boolean } = {}) {
  const toast = useToast();
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmountBRL, setTotalAmountBRL] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [removingCategoryId, setRemovingCategoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<ExpenseCategory | null>(null);

  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<ExpenseStatus | "all">("all");
  const [dateBasis, setDateBasis] = useState<DateBasis>("date");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);

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
    apiGet<{ categories: ExpenseCategory[] }>("/api/expenses/categories")
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
    const params = buildFilterParams();

    apiGet<{ items: Expense[]; total: number; totalAmountBRL: number }>(
      `/api/expenses?${params.toString()}`
    )
      .then((r) => {
        setItems(r.items ?? []);
        setTotal(r.total ?? 0);
        setTotalAmountBRL(r.totalAmountBRL ?? 0);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar despesas")
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

  const payableTotal = useMemo(
    () =>
      items
        .filter((item) => item.status === "agendada" || item.status === "a_pagar")
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

  const startEdit = (item: Expense) => {
    setEditingId(item.id);
    setForm({
      date: item.date,
      category: item.category,
      description: item.description,
      supplier: item.supplier ?? "",
      amountBRL: formatMoneyValue(item.amountBRL),
      paymentMethod: item.paymentMethod ?? "",
      documentNumber: item.documentNumber ?? "",
      dueDate: item.dueDate ?? "",
      scheduledPaymentDate: item.scheduledPaymentDate ?? "",
      paidAt: item.paidAt ?? "",
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
      const r = await apiJson<{ category: ExpenseCategory }>("/api/expenses/categories", {
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

  const removeCategory = async (item: ExpenseCategory) => {
    setRemovingCategoryId(item.id);
    try {
      await apiJson(`/api/expenses/categories/${encodeURIComponent(item.id)}`, {
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
    const isOpenStatus = form.status === "agendada" || form.status === "a_pagar";
    const payload = {
      ...form,
      amountBRL,
      dueDate: isOpenStatus ? form.dueDate : "",
      scheduledPaymentDate: isOpenStatus ? form.scheduledPaymentDate : "",
      paidAt: form.status === "paga" ? form.paidAt || todayIso() : "",
    };
    try {
      await apiJson<{ expense: Expense }>(
        editingId ? `/api/expenses/${editingId}` : "/api/expenses",
        {
          method: editingId ? "PUT" : "POST",
          body: payload,
        }
      );
      toast.success(editingId ? "Despesa atualizada." : "Despesa lançada.");
      resetForm();
      loadCategories();
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar despesa");
    } finally {
      setSaving(false);
    }
  };

  const showOpenPaymentDates = form.status === "agendada" || form.status === "a_pagar";
  const showPaidDate = form.status === "paga";

  const remove = async (item: Expense) => {
    setDeletingId(item.id);
    try {
      await apiJson(`/api/expenses/${item.id}`, { method: "DELETE" });
      toast.success("Despesa excluída.");
      setItems((prev) => prev.filter((expense) => expense.id !== item.id));
      setTotal((prev) => Math.max(0, prev - 1));
      setTotalAmountBRL((prev) => Math.max(0, prev - item.amountBRL));
      if (editingId === item.id) resetForm();
      setDeleteTarget(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir despesa");
    } finally {
      setDeletingId(null);
    }
  };

  const exportFile = (format: "xlsx" | "pdf") => {
    const params = buildFilterParams(false);
    window.location.href = `/api/expenses/export/${format}?${params.toString()}`;
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
            Operação
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Despesas
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Custos gerais, recorrências e contas a pagar.
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
            Contas abertas
          </div>
          <FitValue className="mt-3" maxRem={1.5} minRem={0.95} mono={false}>
            {formatBRL(payableTotal)}
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
        <div className="rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app">
          <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
            Maior categoria
          </div>
          <FitValue className="mt-3" maxRem={1.125} minRem={0.9} mono={false}>
            {categoryTotals[0]?.label ?? "—"}
          </FitValue>
          <div className="mt-1 text-sm text-app-soft">
            {categoryTotals[0] ? formatBRL(categoryTotals[0].value) : "Sem custos no período"}
          </div>
        </div>
      </div>

      <ChartCard title="Categorias" subtitle="Cadastre categorias conforme a operação precisar.">
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
        title={editingId ? "Editar despesa" : "Novo lançamento"}
        subtitle="Despesa operacional, conta a pagar ou compromisso recorrente."
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
            <Field label="Data da despesa" required>
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
                  const nextStatus = e.target.value as ExpenseStatus;
                  setForm((v) => ({
                    ...v,
                    status: nextStatus,
                    dueDate:
                      nextStatus === "agendada" || nextStatus === "a_pagar" ? v.dueDate : "",
                    scheduledPaymentDate:
                      nextStatus === "agendada" || nextStatus === "a_pagar"
                        ? v.scheduledPaymentDate
                        : "",
                    paidAt: nextStatus === "paga" ? v.paidAt || todayIso() : "",
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
                placeholder="Ex.: almoço equipe, diária hotel, abastecimento"
                className={inputClass}
              />
            </Field>
            <Field label="Fornecedor">
              <input
                value={form.supplier}
                onChange={(e) => setForm((v) => ({ ...v, supplier: e.target.value }))}
                placeholder="Ex.: Posto, restaurante, hotel"
                className={inputClass}
              />
            </Field>
            <Field label="Documento">
              <input
                value={form.documentNumber}
                onChange={(e) => setForm((v) => ({ ...v, documentNumber: e.target.value }))}
                placeholder="NF, recibo, placa, OS..."
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {showOpenPaymentDates ? (
              <>
                <Field label="Vencimento">
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((v) => ({ ...v, dueDate: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Pagar em">
                  <input
                    type="date"
                    value={form.scheduledPaymentDate}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, scheduledPaymentDate: e.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>
              </>
            ) : null}
            {showPaidDate ? (
              <Field label="Pago em">
                <input
                  type="date"
                  value={form.paidAt}
                  onChange={(e) => setForm((v) => ({ ...v, paidAt: e.target.value }))}
                  className={inputClass}
                />
              </Field>
            ) : null}
            <Field label="Pagamento">
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
              {saving ? "Salvando..." : editingId ? "Salvar alteração" : "Lançar despesa"}
            </button>
          </div>
        </form>
      </ChartCard>

      <ChartCard
        title="Registros"
        subtitle="Despesas, recorrências e contas a pagar no período."
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
            onChange={(e) => setStatus(e.target.value as ExpenseStatus | "all")}
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
              placeholder="Buscar por descrição, fornecedor, documento..."
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
                  <th className="px-4 py-3">Pagar em</th>
                  <th className="px-4 py-3">Pagamento</th>
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
                          {item.status === "paga" ? <CheckCircle2 className="h-3 w-3" /> : null}
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{item.category}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.description}</div>
                        <div className="mt-1 text-xs text-app-soft">
                          {[item.supplier, item.documentNumber, item.isRecurring ? `Recorrente ${item.recurrenceFrequency ?? ""}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-app-soft">{formatDate(item.dueDate)}</td>
                      <td className="px-4 py-3 font-mono text-app-soft">
                        {formatDate(item.scheduledPaymentDate)}
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
                      Nenhuma despesa encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 text-sm text-app-soft md:flex-row md:items-center md:justify-between">
          <div>
            {total} registro(s) · página {Math.min(page, totalPages)} de {totalPages}
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
                Excluir despesa
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
            Essa ação remove o lançamento da lista de despesas.
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
            A categoria sai da lista de seleção, mas despesas antigas lançadas com ela continuam preservadas.
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
