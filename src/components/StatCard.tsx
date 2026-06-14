import type { ReactNode } from "react";
import Card from "@/components/Card";
import FitValue from "@/components/FitValue";
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
      ? "border-l-emerald-500"
      : accent === "amber"
      ? "border-l-amber-500"
      : accent === "red"
      ? "border-l-rose-500"
      : "border-l-sky-500";

  return (
    <Card className={cn("relative overflow-hidden border-l-4 p-5 pr-14", accentClass)}>
      <div className="min-w-0">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-app-soft">
            {label}
          </div>
          <FitValue className="mt-2" maxRem={1.875} minRem={1.05}>
            {value}
          </FitValue>
          {detail ? (
            <div className="mt-2 text-sm text-app-soft">{detail}</div>
          ) : null}
        </div>
        {icon ? (
          <div className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-2xl bg-surface-soft ring-1 ring-app">
            {icon}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
