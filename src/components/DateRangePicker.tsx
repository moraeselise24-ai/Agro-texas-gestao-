import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  detectRangePreset,
  rangePresets,
  toIsoDate,
  type DateRangePreset,
} from "@/stores/useRangeStore";

const presetOrder: DateRangePreset[] = ["today", "last7", "last30", "month"];

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: { from: string; to: string };
  onChange: (next: { from: string; to: string }) => void;
}) {
  const activePreset = detectRangePreset(value);

  const shift = (days: number) => {
    const from = new Date(value.from);
    const to = new Date(value.to);
    from.setDate(from.getDate() + days);
    to.setDate(to.getDate() + days);
    onChange({ from: toIsoDate(from), to: toIsoDate(to) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-surface-soft p-1 ring-1 ring-app">
        {presetOrder.map(key => {
          const preset = rangePresets[key];
          const active = activePreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(preset.range())}
              className={cn(
                "h-8 rounded-xl px-3 text-xs font-medium transition",
                active
                  ? "bg-emerald-500/20 text-emerald-800 dark:text-emerald-100 ring-1 ring-emerald-400/30"
                  : "text-app-muted hover:bg-surface-hover hover:text-app"
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
        )}
        onClick={() => shift(-7)}
        aria-label="Voltar 7 dias"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2 ring-1 ring-app">
        <Calendar className="h-4 w-4 text-app-muted" />
        <label className="text-xs text-app-soft">De</label>
        <input
          type="date"
          value={value.from}
          onChange={e => onChange({ ...value, from: e.target.value })}
          className="h-8 rounded-lg bg-transparent px-2 text-sm text-app outline-none ring-1 ring-transparent focus:ring-app-strong"
        />
        <label className="text-xs text-app-soft">Até</label>
        <input
          type="date"
          value={value.to}
          onChange={e => onChange({ ...value, to: e.target.value })}
          className="h-8 rounded-lg bg-transparent px-2 text-sm text-app outline-none ring-1 ring-transparent focus:ring-app-strong"
        />
      </div>

      <button
        type="button"
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-surface-soft ring-1 ring-app transition hover:bg-surface-hover"
        )}
        onClick={() => shift(7)}
        aria-label="Avançar 7 dias"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
