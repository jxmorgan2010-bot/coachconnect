/** Small gold count chip — the navbar's unread messages badge and the inbox's "N new". */
export default function CountBadge({ className = "", ...props }: React.ComponentProps<"span">) {
  return (
    <span
      {...props}
      className={`inline-grid h-6 min-w-6 place-items-center rounded-full border-2 border-ink bg-gold px-1.5 text-xs font-bold leading-none text-ink tabular-nums ${className}`}
    />
  );
}
