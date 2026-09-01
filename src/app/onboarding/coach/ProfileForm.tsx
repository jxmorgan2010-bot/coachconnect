"use client";

import { useState } from "react";
import type { Sport, SchoolLevel } from "@/generated/prisma/client";
import { SPORTS, SPORT_LABELS } from "@/lib/sports";
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
};

export default function ProfileForm({
  initial,
  onSaved,
}: {
  initial: ProfileFormValues;
  onSaved: (values: ProfileFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function toggleSport(sport: Sport) {
    setValues((v) => ({
      ...v,
      sports: v.sports.includes(sport) ? v.sports.filter((s) => s !== sport) : [...v.sports, sport],
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    const res = await fetch("/api/coach/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
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
      {error && <p className={errorClass}>{error}</p>}
      {saved && <p className={successClass}>Profile saved.</p>}

      <div>
        <label className={labelClass}>Sports you coach</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((sport) => (
            <button
              type="button"
              key={sport}
              onClick={() => toggleSport(sport)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                values.sports.includes(sport)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-secondary hover:border-primary"
              }`}
            >
              {SPORT_LABELS[sport]}
            </button>
          ))}
        </div>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="city">City</label>
          <input
            id="city"
            className={inputClass}
            value={values.city}
            onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
            required
          />
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
            placeholder="78701"
            className={inputClass}
            value={values.zip}
            onChange={(e) => setValues((v) => ({ ...v, zip: e.target.value }))}
          />
        </div>
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
      </div>

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

      <button type="submit" className={`${primaryButtonClass} self-start`} disabled={loading}>
        {loading ? "Saving..." : "Save profile"}
      </button>
    </form>
  );
}
