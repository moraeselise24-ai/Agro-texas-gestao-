export const formatMoneyInput = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const centsValue = digits.padStart(3, "0");
  const integerPart = centsValue.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const decimalPart = centsValue.slice(-2);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${groupedInteger},${decimalPart}`;
};

export const formatMoneyValue = (value: number): string => {
  if (!Number.isFinite(value)) return "";
  return formatMoneyInput(String(Math.round(value * 100)));
};
