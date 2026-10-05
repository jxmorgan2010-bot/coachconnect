"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Sport } from "@/generated/prisma/client";
import { IconCheck } from "@/components/icons";
import { inputClass, secondaryButtonClass, errorClass } from "@/lib/ui";

type Item = { id: string; label: string; isDone: boolean };

export default function TrainingPlanChecklist({
  childId,
  sport,
  items,
  canAdd = false,
}: {
  childId: string;
  sport: Sport;
  items: Item[];
  canAdd?: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggle(item: Item) {
    setPendingId(item.id);
    const res = await fetch(`/api/training-plan/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !item.isDone }),
    });
    setPendingId(null);
    if (res.ok) router.refresh();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (label.trim().length < 2) {
      setError("Describe the drill or focus area.");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/training-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, sport, label: label.trim() }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setLabel("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canAdd ? "No focus items yet. Add the first drill below." : "No focus items yet. Your coach adds these."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={item.isDone}
                onClick={() => toggle(item)}
                disabled={pendingId === item.id}
                className="flex min-h-11 w-full items-center gap-3 rounded-md border-2 border-line bg-surface px-3 py-2 text-left text-sm hover:border-ink"
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-ink ${item.isDone ? "bg-pitch text-white" : "bg-surface"}`}
                >
                  {item.isDone && <IconCheck className="h-3.5 w-3.5" />}
                </span>
                <span className={item.isDone ? "text-muted-foreground line-through" : "text-ink"}>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <form onSubmit={addItem} className="mt-1 flex flex-wrap gap-2">
          {error && <p role="alert" className={`${errorClass} w-full`}>{error}</p>}
          <input
            aria-label="New focus item"
            className={`${inputClass} min-w-0 flex-1`}
            placeholder="e.g. Left-hand layups"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" className={secondaryButtonClass} disabled={adding}>
            {adding ? "Adding..." : "+ Add"}
          </button>
        </form>
      )}
    </div>
  );
}
