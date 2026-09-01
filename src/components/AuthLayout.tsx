import type { ReactNode } from "react";

export default function AuthLayout({
  panelColor,
  panelIcon,
  panelTitle,
  panelPoints,
  children,
}: {
  panelColor: "pitch" | "gold" | "ink";
  panelIcon: ReactNode;
  panelTitle: string;
  panelPoints: string[];
  children: ReactNode;
}) {
  const bg = panelColor === "pitch" ? "bg-pitch text-white" : panelColor === "gold" ? "bg-gold text-ink" : "bg-ink text-white";
  const dot = panelColor === "gold" ? "bg-ink" : "bg-gold";

  return (
    <div className="grid min-h-[calc(100vh-65px)] md:grid-cols-2">
      <div className={`${bg} texture-hatch-dark flex flex-col justify-center gap-6 border-b-2 border-ink px-8 py-14 md:border-b-0 md:border-r-2 md:px-14`}>
        <span className="grid h-14 w-14 place-items-center rounded-lg border-2 border-ink bg-white/95 text-ink">
          {panelIcon}
        </span>
        <h2 className="font-display text-3xl leading-tight sm:text-4xl">{panelTitle}</h2>
        <ul className="flex flex-col gap-2.5 text-sm font-medium opacity-90">
          {panelPoints.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-center px-4 py-14 sm:px-8">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
