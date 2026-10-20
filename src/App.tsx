import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import Assistente from "@/pages/Assistente";
import Dashboard from "@/pages/Dashboard";
import DashboardDespesas from "@/pages/DashboardDespesas";
import Dados from "@/pages/Dados";
import DiasTrabalhados from "@/pages/DiasTrabalhados";
import OcorrenciasPlacas from "@/pages/OcorrenciasPlacas";
import Configuracoes from "@/pages/Configuracoes";
import Usuarios from "@/pages/Usuarios";
import Programacao from "@/pages/Programacao";
import OrdensServico from "@/pages/OrdensServico";
import Despesas from "@/pages/Despesas";
import Financeiro from "@/pages/Financeiro";
import Patrimonio from "@/pages/Patrimonio";
import Receitas from "@/pages/Receitas";
import Login from "@/pages/Login";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTheme } from "@/hooks/useTheme";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const status = useAuthStore((s) => s.status);

  if (status === "loading") {
    return (
      <div className="min-h-dvh bg-app text-app">
        <div className="pointer-events-none fixed inset-0 bg-app-backdrop" />
        <div className="relative grid min-h-dvh place-items-center px-4">
          <div className="rounded-2xl bg-surface-soft px-4 py-3 text-sm text-app-muted ring-1 ring-app">
            Carregando...
          </div>
        </div>
      </div>
    );
  }

  if (status !== "authed") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function RequirePermission({
  allowed,
  children,
}: {
  allowed: boolean;
  children: React.ReactNode;
}) {
  if (!allowed) {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  const init = useAuthStore((s) => s.init);
  const canAccessDashboard = useAuthStore((s) => s.canAccessDashboard);
  const canAccessFaturamento = useAuthStore((s) => s.canAccessFaturamento);
  const canAccessExpenseDashboard = useAuthStore((s) => s.canAccessExpenseDashboard);
  const canAccessReports = useAuthStore((s) => s.canAccessReports);
  const canAccessProgramacao = useAuthStore((s) => s.canAccessProgramacao);
  const canAccessFinanceiro = useAuthStore((s) => s.canAccessFinanceiro);
  const canAccessIris = useAuthStore((s) => s.canAccessIris);
  const canManageUsers = useAuthStore((s) => s.canManageUsers);
  const canManageConfig = useAuthStore((s) => s.canManageConfig);
  useTheme();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route
            path="/assistente"
            element={
              <RequirePermission allowed={canAccessIris}>
                <Assistente />
              </RequirePermission>
            }
          />
          <Route
            path="/"
            element={
              <RequirePermission allowed={canAccessDashboard || canAccessFaturamento}>
                <Dashboard />
              </RequirePermission>
            }
          />
          <Route
            path="/dashboard-despesas"
            element={
              <RequirePermission allowed={canAccessFinanceiro && canAccessExpenseDashboard}>
                <DashboardDespesas />
              </RequirePermission>
            }
          />
          <Route
            path="/dados"
            element={
              <RequirePermission allowed={canAccessReports}>
                <Dados />
              </RequirePermission>
            }
          />
          <Route
            path="/dias-trabalhados"
            element={
              <RequirePermission allowed={canAccessReports}>
                <DiasTrabalhados />
              </RequirePermission>
            }
          />
          <Route
            path="/ocorrencias-placas"
            element={
              <RequirePermission allowed={canAccessReports}>
                <OcorrenciasPlacas />
              </RequirePermission>
            }
          />
          <Route
            path="/programacao"
            element={
              <RequirePermission allowed={canAccessProgramacao}>
                <Programacao />
              </RequirePermission>
            }
          />
          <Route
            path="/ordens-servico"
            element={
              <RequirePermission allowed={canAccessProgramacao}>
                <OrdensServico />
              </RequirePermission>
            }
          />
          <Route
            path="/financeiro"
            element={
              <RequirePermission allowed={canAccessFinanceiro}>
                <Financeiro />
              </RequirePermission>
            }
          />
          <Route
            path="/patrimonio"
            element={
              <RequirePermission allowed={canAccessFinanceiro}>
                <Patrimonio />
              </RequirePermission>
            }
          />
          <Route
            path="/despesas"
            element={
              <RequirePermission allowed={canAccessFinanceiro}>
                <Despesas />
              </RequirePermission>
            }
          />
          <Route
            path="/receitas"
            element={
              <RequirePermission allowed={canAccessFinanceiro}>
                <Receitas />
              </RequirePermission>
            }
          />
          <Route
            path="/usuarios"
            element={
              <RequirePermission allowed={canManageUsers}>
                <Usuarios />
              </RequirePermission>
            }
          />
          <Route
            path="/config"
            element={
              <RequirePermission allowed={canManageConfig}>
                <Configuracoes />
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
    </Router>
  );
}
