export const roundTons = (value: number): number =>
  Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

const tonsFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const rneFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const formatTons = (value: number): string =>
  tonsFormatter.format(roundTons(value));

export const formatRne = (value: number): string =>
  rneFormatter.format(Math.round(Number.isFinite(value) ? value : 0));

export const tonsAxisLabel = (value: number | string): string =>
  formatTons(Number(value));

export const rneAxisLabel = (value: number | string): string =>
  formatRne(Number(value));
