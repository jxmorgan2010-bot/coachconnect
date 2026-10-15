"use client";

import { useState } from "react";
import {
  ACCOMMODATION_NOTE_MAX,
  LANGUAGES,
  OTHER_LANGUAGES_MAX,
  TRAVEL_RADIUS_OPTIONS,
  type Accommodations,
  type LanguageCode,
  type TravelRadius,
} from "@/lib/accommodations";
import { CONTACT_RULE_TEXT } from "@/lib/contactRule";
import { inputClass, labelClass, primaryButtonClass, errorClass } from "@/lib/ui";
import { useSectionDone } from "./EditableSection";

const choiceClass =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border-2 border-line bg-surface px-3 text-sm font-bold text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-muted has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink";
const controlClass = "h-4 w-4 shrink-0 accent-[var(--pitch)]";

function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <span className={`text-xs ${value.length > max ? "font-bold text-danger" : "text-muted-foreground"}`}>
      {value.length}/{max}
    </span>
  );
}

export default function AccommodationsForm({ initial }: { initial: Accommodations }) {
  const onSaved = useSectionDone();
  const [specialNeeds, setSpecialNeeds] = useState(initial.specialNeedsExperience);
  const [specialNeedsNote, setSpecialNeedsNote] = useState(initial.specialNeedsNote ?? "");
  const [languages, setLanguages] = useState<LanguageCode[]>(initial.languages);
  const [otherLanguages, setOtherLanguages] = useState(initial.languagesOther ?? "");
  const [travel, setTravel] = useState<TravelRadius | null>(initial.travelRadiusMiles);
  const [equipment, setEquipment] = useState<boolean | null>(initial.bringsEquipment);
  const [note, setNote] = useState(initial.accommodationsNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleLanguage(code: LanguageCode) {
    setLanguages((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/coach/accommodations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specialNeedsExperience: specialNeeds,
        specialNeedsNote: specialNeeds ? specialNeedsNote : null,
        languages,
        languagesOther: otherLanguages,
        travelRadiusMiles: travel,
        bringsEquipment: equipment,
        accommodationsNote: note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    onSaved();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Families see this on your profile as your own description. Only share what&apos;s true for you. {CONTACT_RULE_TEXT}
      </p>
      {error && <p role="alert" className={errorClass}>{error}</p>}

      <fieldset className="flex flex-col gap-3">
        <legend className={labelClass}>Special needs</legend>
        <label className={`${choiceClass} self-start`}>
          <input type="checkbox" className={controlClass} checked={specialNeeds} onChange={(e) => setSpecialNeeds(e.target.checked)} />
          I have experience coaching kids with special needs or disabilities
        </label>
        {specialNeeds && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label className={labelClass} htmlFor="special-needs-note">What kind of experience? (optional)</label>
              <CharCount value={specialNeedsNote} max={ACCOMMODATION_NOTE_MAX} />
            </div>
            <textarea
              id="special-needs-note"
              rows={3}
              maxLength={ACCOMMODATION_NOTE_MAX}
              className={inputClass}
              placeholder="e.g. Two seasons helping with my school's unified soccer team"
              value={specialNeedsNote}
              onChange={(e) => setSpecialNeedsNote(e.target.value)}
            />
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className={labelClass}>Languages you can coach in</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <label key={lang.code} className={choiceClass}>
              <input
                type="checkbox"
                className={controlClass}
                checked={languages.includes(lang.code)}
                onChange={() => toggleLanguage(lang.code)}
              />
              {lang.label}
            </label>
          ))}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label className={labelClass} htmlFor="languages-other">Other languages (optional)</label>
            <CharCount value={otherLanguages} max={OTHER_LANGUAGES_MAX} />
          </div>
          <input
            id="languages-other"
            maxLength={OTHER_LANGUAGES_MAX}
            className={inputClass}
            placeholder="e.g. Farsi, Portuguese"
            value={otherLanguages}
            onChange={(e) => setOtherLanguages(e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>How far you&apos;ll travel from your zip</legend>
        <div className="flex flex-wrap gap-2">
          {TRAVEL_RADIUS_OPTIONS.map((miles) => (
            <label key={miles} className={choiceClass}>
              <input type="radio" name="travel" className={controlClass} checked={travel === miles} onChange={() => setTravel(miles)} />
              Up to {miles} miles
            </label>
          ))}
          <label className={choiceClass}>
            <input type="radio" name="travel" className={controlClass} checked={travel === null} onChange={() => setTravel(null)} />
            Don&apos;t show
          </label>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Do you bring your own equipment?</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
            { value: null, label: "Don't show" },
          ].map((option) => (
            <label key={option.label} className={choiceClass}>
              <input
                type="radio"
                name="equipment"
                className={controlClass}
                checked={equipment === option.value}
                onChange={() => setEquipment(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label className={labelClass} htmlFor="accommodations-note">Anything else families should know? (optional)</label>
          <CharCount value={note} max={ACCOMMODATION_NOTE_MAX} />
        </div>
        <textarea
          id="accommodations-note"
          rows={3}
          maxLength={ACCOMMODATION_NOTE_MAX}
          className={inputClass}
          placeholder="e.g. Happy to slow things down for nervous first-timers"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto sm:self-start`} disabled={loading}>
        {loading ? "Saving..." : "Save accommodations"}
      </button>
    </form>
  );
}
