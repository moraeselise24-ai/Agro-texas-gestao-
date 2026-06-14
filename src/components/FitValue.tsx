import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

const fontSizeFor = (value: ReactNode, maxRem: number, minRem: number) => {
  const text = String(value ?? "");
  const length = text.replace(/\s/g, "").length;
  const size = maxRem - Math.max(0, length - 8) * 0.075;
  return Math.max(minRem, Math.min(maxRem, size));
};

export default function FitValue({
  children,
  className,
  maxRem = 1.875,
  minRem = 1.05,
  mono = true,
}: {
  children: ReactNode;
  className?: string;
  maxRem?: number;
  minRem?: number;
  mono?: boolean;
}) {
  const text = String(children ?? "");
  const style: CSSProperties = {
    fontSize: `${fontSizeFor(children, maxRem, minRem)}rem`,
    lineHeight: 1.08,
  };

  return (
    <div
      className={cn(
        "max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-semibold tabular-nums tracking-tight",
        mono && "font-mono",
        className
      )}
      style={style}
      title={text}
    >
      {children}
    </div>
  );
}
