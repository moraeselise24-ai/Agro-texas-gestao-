import Card from "@/components/Card";
import EChart from "@/components/EChart";
import { Maximize2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type ExpandableConfig = {
  option: Record<string, unknown>;
  chartKey?: string;
  onEvents?: Record<string, (params: unknown) => void>;
};

export default function ChartCard({
  title,
  subtitle,
  actions,
  children,
  expandable,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  expandable?: ExpandableConfig;
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-xs text-app-soft">{subtitle}</div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {expandable ? (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="Expandir gráfico"
                title="Expandir gráfico"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
              >
                <Maximize2 className="h-4 w-4 text-app-muted" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </Card>

      {expandable && expanded ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-app-overlay p-4 backdrop-blur sm:p-6">
          <div className="flex h-full w-full flex-col overflow-hidden rounded-3xl bg-app ring-1 ring-app-strong">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-app p-5">
              <div className="min-w-0">
                <div className="text-sm font-semibold tracking-tight">{title}</div>
                {subtitle ? (
                  <div className="mt-1 text-xs text-app-soft">{subtitle}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
                onClick={() => setExpanded(false)}
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 p-4 sm:p-6">
              <EChart
                option={expandable.option}
                chartKey={
                  expandable.chartKey
                    ? `${expandable.chartKey}-expanded`
                    : undefined
                }
                onEvents={expandable.onEvents}
                height="100%"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
