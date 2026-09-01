"use client";

import { useState } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";

export type RecommendationItem = {
  id: string;
  token: string;
  status: "REQUESTED" | "SUBMITTED";
  recommenderName: string | null;
  content: string | null;
};

export default function RecommendationPanel({ initial }: { initial: RecommendationItem[] }) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function requestOne() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/coach/recommendation-request", { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setItems((prev) => [{ id: data.token, token: data.token, status: "REQUESTED", recommenderName: null, content: null }, ...prev]);
  }

  function linkFor(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/recommend/${token}`;
  }

  function copy(token: string) {
    navigator.clipboard?.writeText(linkFor(token));
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 1500);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Optional: ask one of your own coaches to write you a recommendation. Verified recommendations show a
        &quot;Recommended by Coach&quot; badge and boost your visibility in search.
      </p>
      {error && <p className={errorClass}>{error}</p>}

      <button onClick={requestOne} className={`${secondaryButtonClass} self-start`} disabled={loading}>
        {loading ? "Creating link..." : "+ Request a recommendation"}
      </button>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-secondary">
                  {item.recommenderName ?? "Awaiting response"}
                </span>
                <Badge variant={item.status === "SUBMITTED" ? "success" : "neutral"}>
                  {item.status === "SUBMITTED" ? "Submitted" : "Requested"}
                </Badge>
              </div>
              {item.status === "SUBMITTED" ? (
                <p className="text-muted-foreground">{item.content}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => copy(item.token)}
                  className="self-start text-xs font-semibold text-primary"
                >
                  {copiedToken === item.token ? "Link copied!" : "Copy shareable link"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
