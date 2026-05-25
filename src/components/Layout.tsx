import type { ComponentType } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { BarChart3, FileText, Settings } from "lucide-react";
import SidebarRneCard from "@/components/SidebarRneCard";
import { cn } from "@/lib/utils";

const NavItem = ({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
          "hover:bg-white/5",
          isActive ? "bg-white/10 text-white" : "text-white/70"
        )
      }
      end={to === "/"}
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 transition group-hover:bg-white/10">
        <Icon className="h-4 w-4" />
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
};

export default function Layout() {
  return (
    <div className="min-h-dvh bg-[#0B0F19] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_circle_at_30%_10%,rgba(16,185,129,0.18),transparent_55%),radial-gradient(900px_circle_at_90%_20%,rgba(245,158,11,0.14),transparent_55%),radial-gradient(700px_circle_at_60%_90%,rgba(59,130,246,0.12),transparent_55%)]" />
      <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur md:sticky md:top-6">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/50">
              InspectCheck
            </div>
            <div className="mt-1 font-semibold tracking-tight">
              Painel Executivo
            </div>
          </div>
          <nav className="space-y-1">
            <NavItem to="/" label="Dashboard" icon={BarChart3} />
            <NavItem to="/dados" label="Relatório" icon={FileText} />
            <NavItem to="/config" label="Configurações" icon={Settings} />
          </nav>
          <SidebarRneCard />
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
