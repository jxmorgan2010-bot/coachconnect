"use client";

import { useState } from "react";
import type { SkillLevel, Sport } from "@/generated/prisma/client";
import { SPORTS, SPORT_LABELS } from "@/lib/sports";
import { SKILL_LEVEL_LABELS } from "@/lib/skillLevels";
import SportPill from "@/components/SportPill";
import LevelPicker from "@/components/LevelPicker";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, quietLinkClass, errorClass } from "@/lib/ui";

type ChildWithLevels = {
  id: string;
  firstName: string;
  gradeOrAge: string;
  levels: { sport: Sport; level: SkillLevel }[];
};

/** One kid on the family page: their level in each sport, editable in place. */
export default function ChildLevelsCard({ child }: { child: ChildWithLevels }) {
  const [levels, setLevels] = useState(child.levels);
  // The sport being edited, or "new" while choosing which sport to add.
  const [editing, setEditing] = useState<Sport | "new" | null>(null);
  const [newSport, setNewSport] = useState<Sport | "">("");
  const [draft, setDraft] = useState<SkillLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unsetSports = SPORTS.filter((s) => !levels.some((l) => l.sport === s));
  const editSport = editing === "new" ? newSport || null : editing;

  function startEdit(sport: Sport | "new") {
    setEditing(sport);
    setNewSport("");
    setDraft(sport === "new" ? null : (levels.find((l) => l.sport === sport)?.level ?? null));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editSport || !draft) {
      setError(editSport ? "Choose a level." : "Choose a sport.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/children/${child.id}/levels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sport: editSport, level: draft }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setLevels((prev) =>
      SPORTS.flatMap((s) => {
        if (s === editSport) return [{ sport: s, level: draft }];
        const existing = prev.find((l) => l.sport === s);
        return existing ? [existing] : [];
      }),
    );
    setEditing(null);
  }

  return (
    <li className="card flex flex-col gap-3 p-4">
      <p>
        <span className="font-bold text-ink">{child.firstName}</span>
        <span className="text-muted-foreground"> · {child.gradeOrAge}</span>
      </p>

      {levels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No levels set yet. Coaches only take certain levels, so set one for each sport {child.firstName} plays.</p>
      ) : (
        <ul className="flex flex-col divide-y-2 divide-line" aria-label={`${child.firstName}'s levels`}>
          {levels.map(({ sport, level }) => (
            <li key={sport} className="flex items-center justify-between gap-2 py-1">
              <span className="flex items-center gap-2 text-sm">
                <SportPill sport={sport} />
                <span className="font-bold text-ink">{SKILL_LEVEL_LABELS[level]}</span>
              </span>
              {editing !== sport && (
                <button type="button" className={`${quietLinkClass} text-pitch`} onClick={() => startEdit(sport)}>
                  Change<span className="sr-only"> {child.firstName}&apos;s {SPORT_LABELS[sport]} level</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3 border-t-2 border-line pt-3">
          {error && <p role="alert" className={errorClass}>{error}</p>}
          {editing === "new" && (
            <div>
              <label className={labelClass} htmlFor={`sport-${child.id}`}>Sport</label>
              <select
                id={`sport-${child.id}`}
                className={inputClass}
                value={newSport}
                onChange={(e) => setNewSport(e.target.value as Sport)}
              >
                <option value="" disabled>Choose a sport...</option>
                {unsetSports.map((s) => (
                  <option key={s} value={s}>{SPORT_LABELS[s]}</option>
                ))}
              </select>
            </div>
          )}
          <LevelPicker
            name={`level-${child.id}`}
            legend={editSport ? `${child.firstName}'s ${SPORT_LABELS[editSport].toLowerCase()} level` : `${child.firstName}'s level`}
            value={draft}
            onChange={setDraft}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? "Saving..." : "Save level"}
            </button>
            <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        unsetSports.length > 0 && (
          <button type="button" className={`${quietLinkClass} self-start text-pitch`} onClick={() => startEdit("new")}>
            + Set a level for {levels.length === 0 ? "a" : "another"} sport
          </button>
        )
      )}
    </li>
  );
}
