import type { ReactNode } from "react";

/**
 * Two-panel auth screen. On phones the form comes first and the colored panel
 * follows it, so nobody scrolls past a banner to reach the fields.
 */
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
  const bg =
    panelColor === "pitch"
      ? "on-dark bg-pitch text-white texture-hatch"
      : panelColor === "gold"
        ? "bg-gold text-ink texture-hatch-dark"
        : "on-dark bg-ink text-white texture-hatch";
  const rule = panelColor === "gold" ? "border-ink" : "border-gold";

  return (
    <div className="grid min-h-[calc(100vh-66px)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        className={`${bg} order-2 flex flex-col justify-center gap-6 border-t-2 border-ink px-6 py-10 sm:px-10 md:order-1 md:border-r-2 md:border-t-0 md:px-12 md:py-14 lg:px-16`}
      >
        <span className="grid h-14 w-14 place-items-center rounded-lg border-2 border-ink bg-white text-ink shadow-patch-sm">
          {panelIcon}
        </span>
        <h2 className="text-display-md max-w-sm font-display">{panelTitle}</h2>
        <ul className="flex max-w-sm flex-col gap-3 text-sm font-bold">
          {panelPoints.map((point) => (
            <li key={point} className={`border-l-4 ${rule} pl-3 leading-snug`}>
              {point}
            </li>
          ))}
        </ul>
      </aside>

      <div className="order-1 flex justify-center px-4 py-10 sm:px-8 md:order-2 md:items-center md:py-14">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
