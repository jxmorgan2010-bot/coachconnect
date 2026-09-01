import type { ReactNode } from "react";

const VARIANTS = {
  success: "bg-success text-success-foreground border-ink",
  accent: "bg-accent text-accent-foreground border-ink",
  warning: "bg-warning text-warning-foreground border-ink",
  danger: "bg-danger text-danger-foreground border-ink",
  neutral: "bg-muted text-ink border-ink",
} as const;

export default function Badge({
  children,
  variant = "neutral",
  icon,
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  icon?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border-2 px-2 py-0.5 text-xs font-bold ${VARIANTS[variant]}`}
    >
      {icon}
      {children}
    </span>
  );
}
