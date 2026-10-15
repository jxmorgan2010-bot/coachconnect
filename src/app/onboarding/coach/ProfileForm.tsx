"use client";

import { useState } from "react";
import type { Sport, SchoolLevel, SkillLevel } from "@/generated/prisma/client";
import { SPORTS, SPORT_LABELS, SPORT_TAG, SPORT_COLOR } from "@/lib/sports";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, SKILL_LEVEL_DESCRIPTIONS } from "@/lib/skillLevels";
import SportPill from "@/components/SportPill";
import { BAY_AREA_CITIES } from "@/lib/bayArea";
import { inputClass, labelClass, primaryButtonClass, errorClass, successClass } from "@/lib/ui";

export type ProfileFormValues = {
  bio: string;
  schoolLevel: SchoolLevel | "";
  schoolName: string;
  gradYear: string;
  hourlyRateDollars: string;
  city: string;
  state: string;
  zip: string;
  sports: Sport[];
  /** Levels taken per selected sport. A newly picked sport starts with every level. */
  sportLevels: Partial<Record<Sport, SkillLevel[]>>;
};

/** Parts of the form. My profile edits one at a time; onboarding shows them all. */
export type ProfileFormField = "sports" | "school" | "location" | "rate" | "bio";
const ALL_FIELDS: ProfileFormField[] = ["sports", "school", "location", "rate", "bio"];

export default function ProfileForm({
  initial,
  onSaved,
  fields = ALL_FIELDS,
  submitLabel = "Save profile",
}: {
  initial: ProfileFormValues;
  onSaved: (values: ProfileFormValues) => void;
  /**
   * Which parts to show. Every value is still sent, so the server validates the whole profile
   * exactly as onboarding does; hidden parts are sent as they were loaded.
   */
  fields?: ProfileFormField[];
  submitLabel?: string;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const show = (field: ProfileFormField) => fields.includes(field);

  function toggleSport(sport: Sport) {
    setValues((v) => ({
      ...v,
      sports: v.sports.includes(sport) ? v.sports.filter((s) => s !== sport) : [...v.sports, sport],
      sportLevels: v.sportLevels[sport] ? v.sportLevels : { ...v.sportLevels, [sport]: [...SKILL_LEVELS] },
    }));
  }

  function toggleLevel(sport: Sport, level: SkillLevel) {
    setValues((v) => {
      const current = v.sportLevels[sport] ?? [];
      const next = current.includes(level) ? current.filter((l) => l !== level) : [...current, level];
      return { ...v, sportLevels: { ...v.sportLevels, [sport]: next } };
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const missing = values.sports.find((sport) => (values.sportLevels[sport] ?? []).length === 0);
    if (missing) {
      setError(`Pick at least one level for ${SPORT_LABELS[missing]}.`);
      return;
    }

    setLoading(true);
    const { sportLevels, ...rest } = values;
    const res = await fetch("/api/coach/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rest,
        sportLevels: values.sports.map((sport) => ({ sport, levels: sportLevels[sport] ?? [] })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSaved(true);
    onSaved(values);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {saved && <p role="status" className={successClass}>Profile saved.</p>}

      {show("sports") && (
        <div role="group" aria-labelledby="sports-label">
          <p id="sports-label" className={labelClass}>Sports you coach</p>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((sport) => {
              const selected = values.sports.includes(sport);
              const c = SPORT_COLOR[sport];
              return (
                <button
                  type="button"
                  key={sport}
                  aria-pressed={selected}
                  onClick={() => toggleSport(sport)}
                  className={`flex min-h-11 items-center gap-2 rounded-lg border-2 px-3 text-sm font-bold ${
                    selected ? "border-ink shadow-patch-xs" : "border-line bg-surface text-ink hover:border-ink"
                  }`}
                  style={selected ? { background: c.bg, color: c.fg } : undefined}
                >
                  <span className="font-display tracking-wide">{SPORT_TAG[sport]}</span>
                  {SPORT_LABELS[sport]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {show("sports") && values.sports.length > 0 && (
        <div className="rounded-lg border-2 border-line p-4">
          <p className={labelClass}>Levels you take</p>
          <p className="mb-3 text-sm text-muted-foreground">
            Parents set their kid&apos;s level for each sport, and can only book you at levels you take.
          </p>
          <dl className="mb-4 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {SKILL_LEVELS.map((level) => (
              <div key={level} className="contents">
                <dt className="font-bold text-ink">{SKILL_LEVEL_LABELS[level]}</dt>
                <dd className="mb-1.5 text-muted-foreground sm:mb-0">{SKILL_LEVEL_DESCRIPTIONS[level]}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3">
            {SPORTS.filter((sport) => values.sports.includes(sport)).map((sport) => (
              <fieldset key={sport} className="border-t-2 border-line pt-3">
                <legend className="sr-only">{SPORT_LABELS[sport]} levels</legend>
                <p aria-hidden className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                  <SportPill sport={sport} /> {SPORT_LABELS[sport]}
                </p>
                <div className="flex flex-wrap gap-2">
                  {SKILL_LEVELS.map((level) => (
                    <label
                      key={level}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-line bg-surface px-3 text-sm font-bold text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={(values.sportLevels[sport] ?? []).includes(level)}
                        onChange={() => toggleLevel(sport, level)}
                        className="h-4 w-4 accent-[var(--pitch)]"
                      />
                      {SKILL_LEVEL_LABELS[level]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}

      {show("school") && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="schoolLevel">School level</label>
              <select
                id="schoolLevel"
                className={inputClass}
                value={values.schoolLevel}
                onChange={(e) => setValues((v) => ({ ...v, schoolLevel: e.target.value as SchoolLevel }))}
                required
              >
                <option value="" disabled>Select...</option>
                <option value="HIGH_SCHOOL">High School</option>
                <option value="COLLEGE">College</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="gradYear">Graduation year</label>
              <input
                id="gradYear"
                type="number"
                className={inputClass}
                value={values.gradYear}
                onChange={(e) => setValues((v) => ({ ...v, gradYear: e.target.value }))}
                required
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="schoolName">School name</label>
            <input
              id="schoolName"
              className={inputClass}
              value={values.schoolName}
              onChange={(e) => setValues((v) => ({ ...v, schoolName: e.target.value }))}
              required
            />
          </div>
        </>
      )}

      {(show("location") || show("rate")) && (
        <div className="grid grid-cols-2 gap-4">
          {show("location") && (
            <>
              <div>
                <label className={labelClass} htmlFor="city">City</label>
                <select
                  id="city"
                  className={inputClass}
                  value={values.city}
                  onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
                  required
                >
                  <option value="" disabled>Select a Bay Area city...</option>
                  {BAY_AREA_CITIES.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="state">State</label>
                <input
                  id="state"
                  maxLength={2}
                  placeholder="CA"
                  className={inputClass}
                  value={values.state}
                  onChange={(e) => setValues((v) => ({ ...v, state: e.target.value.toUpperCase() }))}
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="zip">Zip code</label>
                <input
                  id="zip"
                  maxLength={10}
                  placeholder="94103"
                  className={inputClass}
                  value={values.zip}
                  onChange={(e) => setValues((v) => ({ ...v, zip: e.target.value }))}
                  required
                />
              </div>
            </>
          )}
          {show("rate") && (
            <div>
              <label className={labelClass} htmlFor="rate">Hourly rate ($)</label>
              <input
                id="rate"
                type="number"
                min={5}
                max={500}
                className={inputClass}
                value={values.hourlyRateDollars}
                onChange={(e) => setValues((v) => ({ ...v, hourlyRateDollars: e.target.value }))}
                required
              />
            </div>
          )}
        </div>
      )}

      {show("bio") && (
        <div>
          <label className={labelClass} htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            rows={5}
            className={inputClass}
            placeholder="Share your playing experience, coaching style, and what a session with you looks like..."
            value={values.bio}
            onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))}
            required
            minLength={30}
          />
        </div>
      )}

      <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto sm:self-start`} disabled={loading}>
        {loading ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
