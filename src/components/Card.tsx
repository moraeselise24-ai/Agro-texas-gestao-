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
        "rounded-2xl bg-app-panel shadow-app ring-1 ring-app",
        className
      )}
    >
      {children}
    </div>
  );
}
