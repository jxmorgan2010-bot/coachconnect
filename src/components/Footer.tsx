import { IconShieldCheck, IconMessage, IconPin } from "@/components/icons";

export default function Footer() {
  return (
    <footer className="border-t-2 border-ink bg-ink text-chalk">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-white/15 pb-6 text-sm font-bold">
          <span className="flex items-center gap-2">
            <IconShieldCheck className="h-4 w-4 text-gold" /> Every coach ID-verified &amp; background-checked
          </span>
          <span className="flex items-center gap-2">
            <IconMessage className="h-4 w-4 text-gold" /> In-app messaging only
          </span>
          <span className="flex items-center gap-2">
            <IconPin className="h-4 w-4 text-gold" /> Sessions at public locations, parent&apos;s choice
          </span>
        </div>
        <div className="flex flex-col gap-2 pt-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-base tracking-wide text-white">
            Coach<span className="text-gold">Connect</span>
          </p>
          <p>&copy; {new Date().getFullYear()} CoachConnect. See something off? Use the Report button — always visible.</p>
        </div>
      </div>
    </footer>
  );
}
