import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export default function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-white/5 ring-1 ring-white/10 backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}
