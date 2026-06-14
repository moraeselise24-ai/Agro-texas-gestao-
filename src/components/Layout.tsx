import { useEffect, useState, type ComponentType } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  CalendarCheck,
  CalendarDays,
  CarFront,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LogOut,
  ReceiptText,
  Settings,
  TrendingDown,
  UserRound,
  Users,
} from "lucide-react";
import IrisIcon from "@/components/IrisIcon";
import ThemeToggle from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

const NavItem = ({
  to,
  label,
  icon: Icon,
  onClick,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
}) => {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
          "hover:bg-surface-hover",
          isActive ? "bg-surface-active text-app" : "text-app-muted"
        )
      }
      end={to === "/"}
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-soft ring-1 ring-app transition group-hover:bg-surface-hover">
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
};

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dashboardsOpen, setDashboardsOpen] = useState(true);
  const [operationOpen, setOperationOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);
  const fullName = useAuthStore((s) => s.fullName);
  const role = useAuthStore((s) => s.role);
  const canAccessDashboard = useAuthStore((s) => s.canAccessDashboard);
  const canAccessExpenseDashboard = useAuthStore((s) => s.canAccessExpenseDashboard);
  const canAccessReports = useAuthStore((s) => s.canAccessReports);
  const canAccessProgramacao = useAuthStore((s) => s.canAccessProgramacao);
  const canAccessFinanceiro = useAuthStore((s) => s.canAccessFinanceiro);
  const canManageUsers = useAuthStore((s) => s.canManageUsers);
  const canManageConfig = useAuthStore((s) => s.canManageConfig);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const displayName = fullName || user?.email || "Usuário";
  const displayEmail = user?.email && user.email !== displayName ? user.email : null;
  const displayRole = role ? role.replace(/^\w/, (c) => c.toUpperCase()) : "Acesso liberado";
  const canAccessAnyDashboard = canAccessDashboard || canAccessExpenseDashboard;
  const dashboardGroupActive = location.pathname === "/" || location.pathname === "/dashboard-despesas";
  const canAccessAnyOperation = canAccessReports || canAccessProgramacao;
  const operationGroupActive = [
    "/dados",
    "/programacao",
    "/ordens-servico",
    "/dias-trabalhados",
    "/ocorrencias-placas",
  ].includes(location.pathname);

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <img
            src="/logo2.png"
            alt="InspectCheck"
            className="h-14 w-auto max-w-[190px] object-contain dark:hidden"
          />
          <img
            src="/logo.png"
            alt="InspectCheck"
            className="hidden h-14 w-auto max-w-[190px] object-contain dark:block"
          />
          <div className="mt-2 font-semibold tracking-tight">
            Painel Executivo
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setCollapsed(true);
          }}
          aria-label="Fechar menu"
          title="Fechar menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      <nav className="space-y-1">
        <NavItem to="/assistente" label="Iris" icon={IrisIcon} />
        {canAccessAnyDashboard ? (
          <div>
            <button
              type="button"
              onClick={() => setDashboardsOpen((value) => !value)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                "hover:bg-surface-hover",
                dashboardGroupActive ? "bg-surface-active text-app" : "text-app-muted"
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-soft ring-1 ring-app transition group-hover:bg-surface-hover">
                <BarChart3 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">Dashboards</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-app-soft transition",
                  (dashboardsOpen || dashboardGroupActive) && "rotate-180"
                )}
              />
            </button>
            {dashboardsOpen || dashboardGroupActive ? (
              <div className="ml-7 mt-1 space-y-1 border-l border-app pl-4">
                {canAccessDashboard ? <NavItem to="/" label="Operacional" icon={BarChart3} /> : null}
                {canAccessExpenseDashboard ? (
                  <NavItem to="/dashboard-despesas" label="Despesas" icon={TrendingDown} />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {canAccessAnyOperation ? (
          <div>
            <button
              type="button"
              onClick={() => setOperationOpen((value) => !value)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition",
                "hover:bg-surface-hover",
                operationGroupActive ? "bg-surface-active text-app" : "text-app-muted"
              )}
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-soft ring-1 ring-app transition group-hover:bg-surface-hover">
                <ClipboardList className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate">Operação</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-app-soft transition",
                  (operationOpen || operationGroupActive) && "rotate-180"
                )}
              />
            </button>
            {operationOpen || operationGroupActive ? (
              <div className="ml-7 mt-1 space-y-1 border-l border-app pl-4">
                {canAccessReports ? <NavItem to="/dados" label="Relatórios" icon={FileText} /> : null}
                {canAccessProgramacao ? <NavItem to="/programacao" label="Programação" icon={CalendarDays} /> : null}
                {canAccessProgramacao ? <NavItem to="/ordens-servico" label="Ordens de Serviço" icon={ClipboardList} /> : null}
                {canAccessReports ? <NavItem to="/dias-trabalhados" label="Dias Trabalhados" icon={CalendarCheck} /> : null}
                {canAccessReports ? <NavItem to="/ocorrencias-placas" label="Ocorrência de Placas" icon={CarFront} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {canAccessFinanceiro ? <NavItem to="/financeiro" label="Financeiro" icon={ReceiptText} /> : null}
        {canAccessFinanceiro ? <NavItem to="/patrimonio" label="Patrimônio" icon={Boxes} /> : null}
        {canManageUsers ? <NavItem to="/usuarios" label="Usuários" icon={Users} /> : null}
        {canManageConfig ? <NavItem to="/config" label="Configurações" icon={Settings} /> : null}
      </nav>
      <div className="mt-auto pt-5">
        <div className="overflow-hidden rounded-2xl bg-surface-soft ring-1 ring-app">
          <div className="grid grid-cols-2 gap-px border-b border-app bg-app-panel/40 p-1">
            <ThemeToggle className="h-9 w-full justify-center rounded-xl bg-transparent px-2 text-xs ring-0 hover:bg-surface-hover" />
            <button
              type="button"
              onClick={() => {
                signOut().finally(() => navigate("/login", { replace: true }));
              }}
              className={cn(
                "group flex h-9 w-full items-center justify-center gap-2 rounded-xl px-2 text-xs transition",
                "text-app-muted hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
              )}
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </button>
          </div>
          <div className="flex items-center gap-3 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-hover ring-1 ring-app">
              <UserRound className="h-5 w-5 text-app-muted" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-app">
                {displayName}
              </div>
              {displayEmail ? (
                <div className="truncate text-xs text-app-soft">{displayEmail}</div>
              ) : null}
              <div className="mt-0.5 truncate text-[11px] uppercase tracking-[0.14em] text-app-faint">
                {displayRole}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-app text-app">
      <div className="pointer-events-none fixed inset-0 bg-app-backdrop" />

      <div
        className={cn(
          "relative mx-auto max-w-[1400px] gap-6 px-4 py-6",
          collapsed
            ? "grid grid-cols-1"
            : "grid grid-cols-1 md:grid-cols-[280px_1fr]"
        )}
      >
        {!collapsed ? (
          <aside className="fixed left-[max(1rem,calc((100vw-1400px)/2+1rem))] top-6 z-20 hidden h-[calc(100dvh-3rem)] w-[280px] overflow-y-auto rounded-2xl bg-app-panel p-4 shadow-app ring-1 ring-app md:flex md:flex-col">
            {sidebarContent}
          </aside>
        ) : null}

        <main className={cn("min-w-0", !collapsed && "md:col-start-2")}>
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  setOpen(true);
                } else {
                  setCollapsed((v) => !v);
                }
              }}
              aria-label={collapsed ? "Abrir menu" : "Fechar menu"}
              title={collapsed ? "Abrir menu" : "Fechar menu"}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover",
                collapsed ? "" : "md:hidden"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Outlet />
        </main>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-app-overlay backdrop-blur-sm"
          />
          <aside className="relative ml-0 flex h-dvh w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-app p-4 ring-1 ring-app">
            {sidebarContent}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
