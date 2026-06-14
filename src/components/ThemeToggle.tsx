import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

export default function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggleTheme } = useTheme();
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl bg-surface-soft px-3 text-sm text-app-muted",
        "ring-1 ring-app transition hover:bg-surface-hover hover:text-app",
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{isDark ? "Claro" : "Escuro"}</span>
    </button>
  );
}
