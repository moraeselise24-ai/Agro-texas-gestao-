import Card from "@/components/Card";
import type { ReactNode } from "react";

export default function ChartCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-tight">{title}</div>
          {subtitle ? (
            <div className="mt-1 text-xs text-white/55">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

