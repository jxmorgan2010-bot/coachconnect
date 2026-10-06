// text-base below sm: iOS Safari zooms the page when focusing an input under 16px.
export const inputClass =
  "min-h-11 w-full rounded-lg border-2 border-ink bg-surface px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground sm:text-sm";

export const labelClass = "mb-1.5 block text-sm font-bold text-ink";

// min-h-11 keeps every button at the 44px tap-target floor.
const buttonBase =
  "press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border-2 border-ink px-5 py-2.5 text-sm font-bold shadow-patch-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none";

export const primaryButtonClass = `${buttonBase} bg-primary text-primary-foreground hover:bg-pitch-bright`;

export const secondaryButtonClass = `${buttonBase} bg-surface text-ink hover:bg-muted`;

export const goldButtonClass = `${buttonBase} bg-accent text-accent-foreground hover:bg-gold-bright`;

// Tertiary actions: still a 44px tap target, but reads as a text link.
export const quietLinkClass =
  "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-bold underline-offset-4 hover:underline";

export const errorClass = "rounded-lg border-2 border-danger bg-danger/10 px-3.5 py-2.5 text-sm font-semibold text-danger";
export const successClass = "rounded-lg border-2 border-success bg-success/10 px-3.5 py-2.5 text-sm font-semibold text-success";
