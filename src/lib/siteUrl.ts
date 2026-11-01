/**
 * The site's own address, for links that leave the site (emails). Not for links the browser
 * builds itself, which use window.location.origin.
 *
 * A preview deployment links to itself, so a test email never sends someone to production.
 * Otherwise SITE_URL (https://getassistcoaching.com in production), then the deployment's own
 * Vercel URL, then localhost.
 */
export function siteUrl(): string {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (process.env.VERCEL_ENV === "preview" && vercelUrl) return `https://${vercelUrl}`;
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (vercelUrl) return `https://${vercelUrl}`;
  return "http://localhost:3000";
}

/** An absolute link to a path on this site, e.g. siteLink("/dashboard/bookings"). */
export function siteLink(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
