import { create } from "zustand";

export type DateRange = {
  from: string;
  to: string;
};

export type DateRangePreset = "today" | "last7" | "last30" | "month";

const pad2 = (n: number) => String(n).padStart(2, "0");

export const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const rangePresets: Record<
  DateRangePreset,
  { label: string; range: () => DateRange }
> = {
  today: {
    label: "Hoje",
    range: () => {
      const today = toIsoDate(new Date());
      return { from: today, to: today };
    },
  },
  last7: {
    label: "7 dias",
    range: () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 6);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    },
  },
  last30: {
    label: "30 dias",
    range: () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    },
  },
  month: {
    label: "Mês",
    range: () => {
      const to = new Date();
      const from = new Date(to.getFullYear(), to.getMonth(), 1);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    },
  },
};

export const detectRangePreset = (value: DateRange): DateRangePreset | null => {
  for (const key of Object.keys(rangePresets) as DateRangePreset[]) {
    const preset = rangePresets[key].range();
    if (preset.from === value.from && preset.to === value.to) return key;
  }
  return null;
};

export const useRangeStore = create<{
  range: DateRange;
  setRange: (range: DateRange) => void;
}>(set => ({
  range: rangePresets.last30.range(),
  setRange: range => set({ range }),
}));
