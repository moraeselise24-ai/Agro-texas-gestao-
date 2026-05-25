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
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10">
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
                  ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
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
          "bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
        )}
        onClick={() => shift(-7)}
        aria-label="Voltar 7 dias"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
        <Calendar className="h-4 w-4 text-white/70" />
        <label className="text-xs text-white/60">De</label>
        <input
          type="date"
          value={value.from}
          onChange={e => onChange({ ...value, from: e.target.value })}
          className="h-8 rounded-lg bg-transparent px-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-white/20"
        />
        <label className="text-xs text-white/60">Até</label>
        <input
          type="date"
          value={value.to}
          onChange={e => onChange({ ...value, to: e.target.value })}
          className="h-8 rounded-lg bg-transparent px-2 text-sm text-white outline-none ring-1 ring-transparent focus:ring-white/20"
        />
      </div>

      <button
        type="button"
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-xl",
          "bg-white/5 ring-1 ring-white/10 transition hover:bg-white/10"
        )}
        onClick={() => shift(7)}
        aria-label="Avançar 7 dias"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
