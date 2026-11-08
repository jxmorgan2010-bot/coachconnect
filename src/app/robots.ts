import type { MetadataRoute } from "next";

/**
 * Keeps crawlers out of private calendar links (each one carries a secret) and the rest of the
 * API. The feed responses also send X-Robots-Tag: noindex, since robots.txt is only a request.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
  };
}
