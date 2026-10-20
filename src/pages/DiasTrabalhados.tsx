import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRoundCheck,
  Weight,
} from "lucide-react";
import ChartCard from "@/components/ChartCard";
import DateRangePicker from "@/components/DateRangePicker";
import FitValue from "@/components/FitValue";
import { useToast } from "@/components/ToastProvider";
import { formatRne, formatTons } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRangeStore } from "@/stores/useRangeStore";
import { apiGet, apiJson } from "@/utils/api";

type WorkedDayClassifierSummary = {
  classifierName: string;
  daysWorked: number;
  volumeDays: number;
  rneDays: number;
  tons: number;
  rneCount: number;
  osCount: number;
  dailyRateBRL: number | null;
  projectedPaymentBRL: number;
  paidAmountBRL: number;
  advanceAmountBRL: number;
  balanceBRL: number;
  paymentStatus: PaymentStatus;
  payments: PaymentEntry[];
  dates: Array<{
    date: string;
    tons: number;
    rneCount: number;
    osCount: number;
    osIds: string[];
    serviceOrders: Array<{
      osId: string;
      farmName: string;
      tons: number;
      rneCount: number;
    }>;
  }>;
};

type PaymentStatus = "a_configurar" | "pendente" | "parcial" | "pago" | "credito";

type PaymentEntry = {
  id: string;
  classifierName: string;
  periodFrom: string;
  periodTo: string;
  amountBRL: number;
  paidAt: string;
  type: "pagamento" | "adiantamento";
  notes: string | null;
  createdByName: string | null;
  createdAt: string | null;
};

type PaymentDraft = {
  amountBRL: string;
  paidAt: string;
  type: "pagamento" | "adiantamento";
  notes: string;
};

type WorkedDaysResponse = {
  items: WorkedDayClassifierSummary[];
  totals: {
    classifiers: number;
    daysWorked: number;
    totalClassifierDays: number;
    tons: number;
    rneCount: number;
    osCount: number;
    projectedPaymentBRL: number;
    paidAmountBRL: number;
    balanceBRL: number;
  };
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const formatCurrency = (value: number): string => currencyFormatter.format(Number(value ?? 0));

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const statusMeta: Record<PaymentStatus, { label: string; className: string }> = {
  a_configurar: {
    label: "Definir diária",
    className: "bg-slate-500/10 text-app-muted ring-slate-500/20",
  },
  pendente: {
    label: "Pendente",
    className: "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-200",
  },
  parcial: {
    label: "Parcial",
    className: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-200",
  },
  pago: {
    label: "Pago",
    className: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-200",
  },
  credito: {
    label: "Crédito",
    className: "bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-200",
  },
};

const formatDate = (value: string): string => {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const inputClass = cn(
  "h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app",
  "outline-none ring-1 ring-app focus:ring-app-strong"
);

const StatTile = ({
  label,
  value,
  detail,
  icon: Icon,
  accent = "emerald",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CalendarCheck;
  accent?: "emerald" | "sky" | "amber";
}) => {
  const accentClass =
    accent === "sky"
      ? "border-l-sky-500"
      : accent === "amber"
        ? "border-l-amber-500"
        : "border-l-emerald-500";

  return (
    <div className={cn("rounded-2xl bg-app-panel p-5 shadow-app ring-1 ring-app border-l-4", accentClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-app-soft">{label}</div>
          <FitValue className="mt-3" maxRem={1.7} minRem={0.95} mono={false}>
            {value}
          </FitValue>
          <div className="mt-2 text-sm text-app-soft">{detail}</div>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-soft ring-1 ring-app">
          <Icon className="h-5 w-5 text-app-muted" />
        </span>
      </div>
    </div>
  );
};

export default function DiasTrabalhados() {
  const toast = useToast();
  const { range, setRange } = useRangeStore();
  const [items, setItems] = useState<WorkedDayClassifierSummary[]>([]);
  const [totals, setTotals] = useState<WorkedDaysResponse["totals"]>({
    classifiers: 0,
    daysWorked: 0,
    totalClassifierDays: 0,
    tons: 0,
    rneCount: 0,
    osCount: 0,
    projectedPaymentBRL: 0,
    paidAmountBRL: 0,
    balanceBRL: 0,
  });
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", range.from);
    p.set("to", range.to);
    if (query.trim()) p.set("q", query.trim());
    return p.toString();
  }, [query, range.from, range.to]);

  const load = () => {
    setLoading(true);
    apiGet<WorkedDaysResponse>(`/api/worked-days?${params}`)
      .then((response) => {
        setItems(response.items ?? []);
        setTotals(
          response.totals ?? {
            classifiers: 0,
            daysWorked: 0,
            totalClassifierDays: 0,
            tons: 0,
            rneCount: 0,
            osCount: 0,
            projectedPaymentBRL: 0,
            paidAmountBRL: 0,
            balanceBRL: 0,
          }
        );
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar dias trabalhados");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [params]);

  const runSearch = () => setQuery(q.trim());

  const exportFile = (format: "xlsx" | "pdf") => {
    window.location.href = `/api/worked-days/export/${format}?${params}`;
  };

  const getPaymentDraft = (classifierName: string): PaymentDraft =>
    paymentDrafts[classifierName] ?? {
      amountBRL: "",
      paidAt: todayIso(),
      type: "pagamento",
      notes: "",
    };

  const updatePaymentDraft = (classifierName: string, patch: Partial<PaymentDraft>) => {
    setPaymentDrafts((current) => ({
      ...current,
      [classifierName]: { ...getPaymentDraft(classifierName), ...patch },
    }));
  };

  const saveDailyRate = async (item: WorkedDayClassifierSummary) => {
    const dailyRateBRL = Number(rateDrafts[item.classifierName] ?? item.dailyRateBRL ?? 0);
    if (!Number.isFinite(dailyRateBRL) || dailyRateBRL <= 0) {
      toast.error("Informe uma diária maior que zero.");
      return;
    }
    const key = `rate:${item.classifierName}`;
    setSavingKey(key);
    try {
      await apiJson(`/api/worked-days/rates/${encodeURIComponent(item.classifierName)}`, {
        method: "PUT",
        body: { dailyRateBRL },
      });
      toast.success("Diária atualizada.");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar diária.");
    } finally {
      setSavingKey(null);
    }
  };

  const savePayment = async (item: WorkedDayClassifierSummary) => {
    const draft = getPaymentDraft(item.classifierName);
    const amountBRL = Number(draft.amountBRL);
    if (!Number.isFinite(amountBRL) || amountBRL <= 0 || !draft.paidAt) {
      toast.error("Informe o valor e a data do lançamento.");
      return;
    }
    const key = `payment:${item.classifierName}`;
    setSavingKey(key);
    try {
      await apiJson("/api/worked-days/payments", {
        method: "POST",
        body: {
          classifierName: item.classifierName,
          periodFrom: range.from,
          periodTo: range.to,
          amountBRL,
          paidAt: draft.paidAt,
          type: draft.type,
          notes: draft.notes,
        },
      });
      setPaymentDrafts((current) => ({
        ...current,
        [item.classifierName]: { amountBRL: "", paidAt: todayIso(), type: "pagamento", notes: "" },
      }));
      toast.success("Lançamento registrado.");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar lançamento.");
    } finally {
      setSavingKey(null);
    }
  };

  const deletePayment = async (payment: PaymentEntry) => {
    if (!window.confirm(`Excluir o lançamento de ${formatCurrency(payment.amountBRL)}?`)) return;
    const key = `delete:${payment.id}`;
    setSavingKey(key);
    try {
      await apiJson(`/api/worked-days/payments/${payment.id}`, { method: "DELETE" });
      toast.success("Lançamento excluído.");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir lançamento.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Produção
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Dias trabalhados
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Dias em que cada classificador movimentou O.S. por volume ou RNE.
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <StatTile
          label="Classificadores"
          value={formatRne(totals.classifiers)}
          detail="Com movimentação no período"
          icon={UserRoundCheck}
          accent="sky"
        />
        <StatTile
          label="Dias com trabalho"
          value={formatRne(totals.daysWorked)}
          detail="Dias únicos no período"
          icon={CalendarCheck}
        />
        <StatTile
          label="Total geral"
          value={formatRne(totals.totalClassifierDays)}
          detail="Soma dos dias de todos"
          icon={CalendarCheck}
          accent="sky"
        />
        <StatTile
          label="Volume"
          value={`${formatTons(totals.tons)} t`}
          detail="Toneladas vinculadas"
          icon={Weight}
        />
        <StatTile
          label="RNE"
          value={formatRne(totals.rneCount)}
          detail="Lançamentos RNE"
          icon={CalendarCheck}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile
          label="Previsto para pagar"
          value={formatCurrency(totals.projectedPaymentBRL)}
          detail="Diárias configuradas no período"
          icon={CircleDollarSign}
          accent="sky"
        />
        <StatTile
          label="Já lançado"
          value={formatCurrency(totals.paidAmountBRL)}
          detail="Pagamentos e adiantamentos"
          icon={CheckCircle2}
        />
        <StatTile
          label="Saldo em aberto"
          value={formatCurrency(totals.balanceBRL)}
          detail="Ainda falta conciliar"
          icon={Clock3}
          accent="amber"
        />
      </div>

      <ChartCard
        title="Classificadores"
        subtitle="Ranking por quantidade de dias trabalhados no período."
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
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-app-faint" />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") runSearch();
              }}
              placeholder="Buscar classificador..."
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
            <table className="w-full min-w-[1420px] text-left text-sm">
              <thead className="bg-surface-soft text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-4 py-3">Classificador</th>
                  <th className="px-4 py-3 text-right">Dias</th>
                  <th className="px-4 py-3 text-right">Diária</th>
                  <th className="px-4 py-3 text-right">Previsto</th>
                  <th className="px-4 py-3 text-right">Lançado</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Situação</th>
                  <th className="px-4 py-3 text-right">Dias volume</th>
                  <th className="px-4 py-3 text-right">Dias RNE</th>
                  <th className="px-4 py-3 text-right">Volume</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-app-soft">
                      Carregando...
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((item) => {
                    const isOpen = expanded === item.classifierName;
                    const status = statusMeta[item.paymentStatus];
                    const draft = getPaymentDraft(item.classifierName);
                    return (
                      <Fragment key={item.classifierName}>
                        <tr className="transition hover:bg-surface-hover">
                          <td className="px-4 py-3 font-medium">{item.classifierName}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {formatRne(item.daysWorked)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.dailyRateBRL == null ? "-" : formatCurrency(item.dailyRateBRL)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold">
                            {item.dailyRateBRL == null ? "-" : formatCurrency(item.projectedPaymentBRL)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-700 dark:text-emerald-200">
                            {formatCurrency(item.paidAmountBRL)}
                          </td>
                          <td
                            className={cn(
                              "px-4 py-3 text-right font-mono font-semibold",
                              item.balanceBRL > 0 ? "text-amber-700 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-200"
                            )}
                          >
                            {item.dailyRateBRL == null ? "-" : formatCurrency(item.balanceBRL)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1", status.className)}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.volumeDays)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatRne(item.rneDays)}</td>
                          <td className="px-4 py-3 text-right font-mono">{formatTons(item.tons)} t</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setExpanded(isOpen ? null : item.classifierName)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                              aria-label="Ver dias"
                              title="Ver dias"
                            >
                              <ChevronDown className={cn("h-4 w-4 transition", isOpen && "rotate-180")} />
                            </button>
                          </td>
                        </tr>
                        {isOpen ? (
                          <tr className="bg-surface-soft/50">
                            <td colSpan={11} className="px-4 py-4">
                              <section className="overflow-hidden rounded-xl bg-app-panel ring-1 ring-app">
                                <div className="grid divide-y divide-app lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:divide-x lg:divide-y-0">
                                  <div className="p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">Fechamento do período</div>
                                    <div className="mt-4 grid grid-cols-2 gap-4">
                                      <div>
                                        <div className="text-xs text-app-soft">Dias apurados</div>
                                        <div className="mt-1 font-mono text-lg font-semibold">{formatRne(item.daysWorked)}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-app-soft">Valor projetado</div>
                                        <div className="mt-1 font-mono text-lg font-semibold">{formatCurrency(item.projectedPaymentBRL)}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-app-soft">Já pago</div>
                                        <div className="mt-1 font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-200">{formatCurrency(item.paidAmountBRL)}</div>
                                      </div>
                                      <div>
                                        <div className="text-xs text-app-soft">Ainda falta</div>
                                        <div className={cn("mt-1 font-mono text-lg font-semibold", item.balanceBRL > 0 ? "text-amber-700 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-200")}>
                                          {formatCurrency(item.balanceBRL)}
                                        </div>
                                      </div>
                                    </div>
                                    {item.advanceAmountBRL > 0 ? (
                                      <div className="mt-4 border-t border-app pt-3 text-sm text-app-soft">
                                        Inclui {formatCurrency(item.advanceAmountBRL)} em adiantamentos.
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="p-4">
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">Ajustes e lançamento</div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                      <label className="block">
                                        <span className="text-xs text-app-soft">Diária do colaborador</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          inputMode="decimal"
                                          value={rateDrafts[item.classifierName] ?? (item.dailyRateBRL == null ? "" : String(item.dailyRateBRL))}
                                          onChange={(event) => setRateDrafts((current) => ({ ...current, [item.classifierName]: event.target.value }))}
                                          placeholder="0,00"
                                          className={cn(inputClass, "mt-1 font-mono")}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => void saveDailyRate(item)}
                                        disabled={savingKey === `rate:${item.classifierName}`}
                                        className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-50"
                                      >
                                        <CircleDollarSign className="h-4 w-4" />
                                        Salvar diária
                                      </button>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <label className="block">
                                        <span className="text-xs text-app-soft">Valor do lançamento</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          inputMode="decimal"
                                          value={draft.amountBRL}
                                          onChange={(event) => updatePaymentDraft(item.classifierName, { amountBRL: event.target.value })}
                                          placeholder="0,00"
                                          className={cn(inputClass, "mt-1 font-mono")}
                                        />
                                      </label>
                                      <label className="block">
                                        <span className="text-xs text-app-soft">Data</span>
                                        <input
                                          type="date"
                                          value={draft.paidAt}
                                          onChange={(event) => updatePaymentDraft(item.classifierName, { paidAt: event.target.value })}
                                          className={cn(inputClass, "mt-1")}
                                        />
                                      </label>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-end gap-3">
                                      <div className="inline-flex h-10 rounded-xl bg-surface-soft p-1 ring-1 ring-app">
                                        {(["pagamento", "adiantamento"] as const).map((type) => (
                                          <button
                                            key={type}
                                            type="button"
                                            onClick={() => updatePaymentDraft(item.classifierName, { type })}
                                            className={cn(
                                              "rounded-lg px-3 text-xs font-medium transition",
                                              draft.type === type ? "bg-app-panel text-app shadow-sm ring-1 ring-app" : "text-app-muted hover:text-app"
                                            )}
                                          >
                                            {type === "pagamento" ? "Pagamento" : "Adiantamento"}
                                          </button>
                                        ))}
                                      </div>
                                      <label className="min-w-[220px] flex-1">
                                        <span className="sr-only">Observação</span>
                                        <input
                                          value={draft.notes}
                                          onChange={(event) => updatePaymentDraft(item.classifierName, { notes: event.target.value })}
                                          placeholder="Observação do lançamento"
                                          className={inputClass}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => void savePayment(item)}
                                        disabled={savingKey === `payment:${item.classifierName}`}
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        <Plus className="h-4 w-4" />
                                        Registrar
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                <div className="border-t border-app p-4">
                                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">Lançamentos do período</div>
                                  {item.payments.length ? (
                                    <div className="mt-3 divide-y divide-app">
                                      {item.payments.map((payment) => (
                                        <div key={payment.id} className="flex items-center gap-3 py-3">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="font-mono font-semibold">{formatCurrency(payment.amountBRL)}</span>
                                              <span className={cn("rounded-full px-2 py-0.5 text-xs ring-1", payment.type === "adiantamento" ? "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-200" : "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-200")}>
                                                {payment.type === "adiantamento" ? "Adiantamento" : "Pagamento"}
                                              </span>
                                              <span className="text-xs text-app-soft">{formatDate(payment.paidAt)}</span>
                                            </div>
                                            {payment.notes ? <div className="mt-1 text-sm text-app-soft">{payment.notes}</div> : null}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => void deletePayment(payment)}
                                            disabled={savingKey === `delete:${payment.id}`}
                                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-app-muted ring-1 ring-app transition hover:bg-surface-hover hover:text-red-600 disabled:opacity-50"
                                            aria-label="Excluir lançamento"
                                            title="Excluir lançamento"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-3 text-sm text-app-soft">Nenhum pagamento ou adiantamento lançado neste período.</div>
                                  )}
                                </div>
                              </section>

                              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {item.dates.map((date) => (
                                  <div
                                    key={`${item.classifierName}-${date.date}`}
                                    className="rounded-2xl bg-app-panel px-4 py-3 ring-1 ring-app"
                                  >
                                    <div className="font-mono text-sm font-semibold">{formatDate(date.date)}</div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-app-soft">
                                      <span>{formatTons(date.tons)} t</span>
                                      <span>{formatRne(date.rneCount)} RNE</span>
                                      <span>{formatRne(date.osCount)} O.S.</span>
                                    </div>
                                    <div className="mt-3 space-y-1.5">
                                      {date.serviceOrders?.length ? (
                                        date.serviceOrders.map((order) => (
                                          <div
                                            key={`${date.date}-${order.osId}`}
                                            className="rounded-xl bg-surface-soft px-3 py-2 text-xs ring-1 ring-app"
                                          >
                                            <div className="font-mono font-semibold text-app">
                                              {order.osId}
                                            </div>
                                            <div className="mt-1 line-clamp-2 text-app-soft">
                                              {order.farmName || "Fazenda não informada"}
                                            </div>
                                          </div>
                                        ))
                                      ) : date.osIds.length ? (
                                        date.osIds.map((osId) => (
                                          <div
                                            key={`${date.date}-${osId}`}
                                            className="rounded-xl bg-surface-soft px-3 py-2 font-mono text-xs text-app-soft ring-1 ring-app"
                                          >
                                            {osId}
                                          </div>
                                        ))
                                      ) : (
                                        <span className="text-xs text-app-faint">Sem O.S. identificada</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="px-4 py-6 text-app-soft">
                      Nenhum classificador com movimentação no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
