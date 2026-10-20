import { useEffect, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Save, Trash2, UserPlus, X } from "lucide-react";
import ChartCard from "@/components/ChartCard";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";
import { apiGet, apiJson } from "@/utils/api";

type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: string | null;
  canAccessDashboard: boolean;
  canAccessFaturamento: boolean;
  canAccessExpenseDashboard: boolean;
  canAccessReports: boolean;
  canAccessProgramacao: boolean;
  canAccessFinanceiro: boolean;
  canAccessIris: boolean;
  canManageUsers: boolean;
  canManageConfig: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  lastSeenAt: string | null;
  emailConfirmed: boolean;
};

const Field = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) => {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-[0.16em] text-app-soft">
        {label}
        {required ? <span className="ml-1 text-rose-700 dark:text-rose-300">*</span> : null}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className={cn(
          "mt-2 h-11 w-full rounded-2xl bg-surface-soft px-4 text-sm text-app",
          "outline-none ring-1 ring-app focus:ring-app-strong"
        )}
      />
    </label>
  );
};

const PermissionToggle = ({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-[72px] items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left ring-1 transition",
        checked
          ? "bg-emerald-500/12 ring-emerald-500/30"
          : "bg-surface-soft ring-app hover:bg-surface-hover"
      )}
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-app">{label}</span>
        <span className="mt-1 block text-xs text-app-soft">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full ring-1 transition",
          checked
            ? "bg-emerald-500/80 ring-emerald-400/40"
            : "bg-surface-muted ring-app"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition",
            checked ? "left-6" : "left-1"
          )}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs font-semibold uppercase tracking-[0.14em] text-app-soft">
        {checked ? "Sim" : "Não"}
      </span>
    </button>
  );
};

const formatDate = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type EditState = {
  user: UserRow;
  fullName: string;
  role: string;
  canAccessDashboard: boolean;
  canAccessFaturamento: boolean;
  canAccessExpenseDashboard: boolean;
  canAccessReports: boolean;
  canAccessProgramacao: boolean;
  canAccessFinanceiro: boolean;
  canAccessIris: boolean;
  canManageUsers: boolean;
  canManageConfig: boolean;
  password: string;
};

export default function Usuarios() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [canAccessDashboard, setCanAccessDashboard] = useState(false);
  const [canAccessFaturamento, setCanAccessFaturamento] = useState(false);
  const [canAccessExpenseDashboard, setCanAccessExpenseDashboard] = useState(false);
  const [canAccessReports, setCanAccessReports] = useState(false);
  const [canAccessProgramacao, setCanAccessProgramacao] = useState(false);
  const [canAccessFinanceiro, setCanAccessFinanceiro] = useState(false);
  const [canAccessIris, setCanAccessIris] = useState(false);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [canManageConfig, setCanManageConfig] = useState(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    setLoading(true);
    apiGet<{ users: UserRow[] }>("/api/users")
      .then((r) => setUsers(r.users))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Falha ao carregar usuários")
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setCreating(true);
    try {
      await apiJson("/api/users", {
        method: "POST",
        body: {
          email,
          password,
          fullName,
          role,
          canAccessDashboard,
          canAccessFaturamento,
          canAccessExpenseDashboard,
          canAccessReports,
          canAccessProgramacao,
          canAccessFinanceiro,
          canAccessIris,
          canManageUsers,
          canManageConfig,
        },
      });
      toast.success(`Usuário ${email} criado com sucesso.`);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("");
      setCanAccessDashboard(false);
      setCanAccessFaturamento(false);
      setCanAccessExpenseDashboard(false);
      setCanAccessReports(false);
      setCanAccessProgramacao(false);
      setCanAccessFinanceiro(false);
      setCanAccessIris(false);
      setCanManageUsers(false);
      setCanManageConfig(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (user: UserRow) => {
    const ok = window.confirm(
      `Excluir o usuário ${user.email}? Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    setDeletingId(user.id);
    try {
      await apiJson(`/api/users/${user.id}`, { method: "DELETE" });
      toast.success(`Usuário ${user.email} excluído.`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir usuário");
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (user: UserRow) => {
    setEdit({
      user,
      fullName: user.fullName ?? "",
      role: user.role ?? "",
      canAccessDashboard: Boolean(user.canAccessDashboard),
      canAccessFaturamento: Boolean(user.canAccessFaturamento),
      canAccessExpenseDashboard: Boolean(user.canAccessExpenseDashboard),
      canAccessReports: Boolean(user.canAccessReports),
      canAccessProgramacao: Boolean(user.canAccessProgramacao),
      canAccessFinanceiro: Boolean(user.canAccessFinanceiro),
      canAccessIris: Boolean(user.canAccessIris),
      canManageUsers: Boolean(user.canManageUsers),
      canManageConfig: Boolean(user.canManageConfig),
      password: "",
    });
  };

  const saveEdit = async () => {
    if (!edit) return;
    setSavingEdit(true);
    try {
      const payload: Record<string, string | boolean> = {
        fullName: edit.fullName,
        role: edit.role,
        canAccessDashboard: edit.canAccessDashboard,
        canAccessFaturamento: edit.canAccessFaturamento,
        canAccessExpenseDashboard: edit.canAccessExpenseDashboard,
        canAccessReports: edit.canAccessReports,
        canAccessProgramacao: edit.canAccessProgramacao,
        canAccessFinanceiro: edit.canAccessFinanceiro,
        canAccessIris: edit.canAccessIris,
        canManageUsers: edit.canManageUsers,
        canManageConfig: edit.canManageConfig,
      };
      const r = await apiJson<{ user: UserRow }>(`/api/users/${edit.user.id}`, {
        method: "PATCH",
        body: edit.password ? { ...payload, password: edit.password } : payload,
      });
      toast.success(`Usuário ${edit.user.email} atualizado.`);
      setUsers((prev) =>
        prev.map((u) => (u.id === edit.user.id ? r.user ?? u : u))
      );
      setEdit(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar usuário");
    } finally {
      setSavingEdit(false);
    }
  };

  const userCount = useMemo(() => users.length, [users]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.2em] text-app-faint">
            Acesso
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Usuários
          </h1>
          <div className="mt-2 text-sm text-app-soft">
            Crie e gerencie usuários com acesso ao painel.
          </div>
        </div>
      </header>

      <ChartCard
        title="Novo usuário"
        subtitle="O e-mail será confirmado automaticamente."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field
              label="E-mail"
              value={email}
              onChange={setEmail}
              type="email"
              placeholder="usuario@empresa.com"
              required
              autoComplete="off"
            />
            <Field
              label="Senha"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              autoComplete="new-password"
            />
            <Field
              label="Nome completo"
              value={fullName}
              onChange={setFullName}
              placeholder="Opcional"
            />
            <Field
              label="Função"
              value={role}
              onChange={setRole}
              placeholder="Ex.: financeiro, gestor, operador"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <PermissionToggle
              label="Dashboard Operação"
              description="Indicadores operacionais, volume e RNE."
              checked={canAccessDashboard}
              onChange={setCanAccessDashboard}
            />
            <PermissionToggle
              label="Faturamento"
              description="Aba de faturamento do dashboard operacional."
              checked={canAccessFaturamento}
              onChange={setCanAccessFaturamento}
            />
            <PermissionToggle
              label="Dashboard Despesas"
              description="Indicadores e gráficos de despesas."
              checked={canAccessExpenseDashboard}
              onChange={setCanAccessExpenseDashboard}
            />
            <PermissionToggle
              label="Relatório"
              description="Consulta, filtros e exportação de registros."
              checked={canAccessReports}
              onChange={setCanAccessReports}
            />
            <PermissionToggle
              label="Programação"
              description="Geração e consulta de programação."
              checked={canAccessProgramacao}
              onChange={setCanAccessProgramacao}
            />
            <PermissionToggle
              label="Financeiro"
              description="Despesas, receitas e resultado."
              checked={canAccessFinanceiro}
              onChange={setCanAccessFinanceiro}
            />
            <PermissionToggle
              label="Iris"
              description="Acesso ao assistente inteligente."
              checked={canAccessIris}
              onChange={setCanAccessIris}
            />
            <PermissionToggle
              label="Usuários"
              description="Pode criar, editar e excluir usuários."
              checked={canManageUsers}
              onChange={setCanManageUsers}
            />
            <PermissionToggle
              label="Configurações"
              description="Pode alterar regras e sincronização."
              checked={canManageConfig}
              onChange={setCanManageConfig}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating || !email || !password}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-2xl px-4 text-sm",
                "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover disabled:opacity-40"
              )}
            >
              <UserPlus className="h-4 w-4" />
              {creating ? "Criando..." : "Criar usuário"}
            </button>
          </div>
        </form>
      </ChartCard>

      <ChartCard
        title="Usuários cadastrados"
        subtitle={loading ? "Carregando..." : `${userCount} usuário(s)`}
      >
        {users.length === 0 && !loading ? (
          <div className="text-sm text-app-soft">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-app-soft">
                <tr>
                  <th className="px-3 py-2 font-medium">E-mail</th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Papel</th>
                  <th className="px-3 py-2 font-medium">Acessos</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-3 py-2 font-medium">Último acesso</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-app">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-hover">
                    <td className="px-3 py-3 font-mono">{u.email}</td>
                    <td className="px-3 py-3">{u.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-app-muted">{u.role ?? "—"}</td>
                    <td className="px-3 py-3 text-app-muted">
                      {[
                        u.canAccessDashboard,
                        u.canAccessFaturamento,
                        u.canAccessExpenseDashboard,
                        u.canAccessReports,
                        u.canAccessProgramacao,
                        u.canAccessFinanceiro,
                        u.canAccessIris,
                        u.canManageUsers,
                        u.canManageConfig,
                      ].filter(Boolean).length}
                      /9
                    </td>
                    <td className="px-3 py-3 font-mono text-app-muted">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-3 py-3 font-mono text-app-muted">
                      {formatDate(u.lastSeenAt ?? u.lastSignInAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(u)}
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs",
                            "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                          )}
                          aria-label={`Editar ${u.email}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(u)}
                          disabled={deletingId === u.id}
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-xl px-3 text-xs",
                            "bg-rose-500/10 text-rose-800 dark:text-rose-200 ring-1 ring-rose-500/20 transition hover:bg-rose-500/20 disabled:opacity-40"
                          )}
                          aria-label={`Excluir ${u.email}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === u.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-overlay p-3 sm:p-4">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[680px] flex-col overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-app p-4 sm:p-5">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.18em] text-app-faint">
                  Editar usuário
                </div>
                <h2 className="mt-1 truncate text-lg font-semibold">
                  {edit.user.email}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setEdit(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-4 [scrollbar-width:none] sm:p-5 [&::-webkit-scrollbar]:hidden">
              <Field
                label="Nome completo"
                value={edit.fullName}
                onChange={(v) => setEdit({ ...edit, fullName: v })}
              />
              <Field
                label="Função"
                value={edit.role}
                onChange={(v) => setEdit({ ...edit, role: v })}
                placeholder="financeiro, gestor, operador..."
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <PermissionToggle
                  label="Dashboard Operação"
                  description="Indicadores operacionais, volume e RNE."
                  checked={edit.canAccessDashboard}
                  onChange={(v) => setEdit({ ...edit, canAccessDashboard: v })}
                />
                <PermissionToggle
                  label="Faturamento"
                  description="Aba de faturamento do dashboard operacional."
                  checked={edit.canAccessFaturamento}
                  onChange={(v) => setEdit({ ...edit, canAccessFaturamento: v })}
                />
                <PermissionToggle
                  label="Dashboard Despesas"
                  description="Indicadores e gráficos de despesas."
                  checked={edit.canAccessExpenseDashboard}
                  onChange={(v) => setEdit({ ...edit, canAccessExpenseDashboard: v })}
                />
                <PermissionToggle
                  label="Relatório"
                  description="Consulta, filtros e exportação de registros."
                  checked={edit.canAccessReports}
                  onChange={(v) => setEdit({ ...edit, canAccessReports: v })}
                />
                <PermissionToggle
                  label="Programação"
                  description="Geração e consulta de programação."
                  checked={edit.canAccessProgramacao}
                  onChange={(v) => setEdit({ ...edit, canAccessProgramacao: v })}
                />
                <PermissionToggle
                  label="Financeiro"
                  description="Despesas, receitas e resultado."
                  checked={edit.canAccessFinanceiro}
                  onChange={(v) => setEdit({ ...edit, canAccessFinanceiro: v })}
                />
                <PermissionToggle
                  label="Iris"
                  description="Acesso ao assistente inteligente."
                  checked={edit.canAccessIris}
                  onChange={(v) => setEdit({ ...edit, canAccessIris: v })}
                />
                <PermissionToggle
                  label="Usuários"
                  description="Pode criar, editar e excluir usuários."
                  checked={edit.canManageUsers}
                  onChange={(v) => setEdit({ ...edit, canManageUsers: v })}
                />
                <PermissionToggle
                  label="Configurações"
                  description="Pode alterar regras e sincronização."
                  checked={edit.canManageConfig}
                  onChange={(v) => setEdit({ ...edit, canManageConfig: v })}
                />
              </div>
              <Field
                label="Nova senha"
                value={edit.password}
                onChange={(v) => setEdit({ ...edit, password: v })}
                type="password"
                placeholder="Deixe em branco para manter a atual"
                autoComplete="new-password"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-surface-soft px-4 text-sm ring-1 ring-app transition hover:bg-surface-hover"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-500/15 px-4 text-sm text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/30 transition hover:bg-emerald-500/25 disabled:opacity-40"
                >
                  {edit.password ? (
                    <KeyRound className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {savingEdit ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
