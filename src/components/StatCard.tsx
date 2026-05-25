import type { ReactNode } from "react";
import Card from "@/components/Card";
import { cn } from "@/lib/utils";

export default function StatCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: "green" | "amber" | "blue" | "red";
  icon?: ReactNode;
}) {
  const accentClass =
    accent === "green"
      ? "from-emerald-500/25 to-transparent"
      : accent === "amber"
      ? "from-amber-500/25 to-transparent"
      : accent === "red"
      ? "from-rose-500/25 to-transparent"
      : "from-sky-500/25 to-transparent";

  return (
    <Card className="relative overflow-hidden p-5">
      <div
        className={cn(
          "pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br blur-2xl",
          accentClass
        )}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-white/55">
            {label}
          </div>
          <div className="mt-2 font-mono text-3xl font-semibold tracking-tight">
            {value}
          </div>
          {detail ? (
            <div className="mt-2 text-sm text-white/60">{detail}</div>
          ) : null}
        </div>
        {icon ? (
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

