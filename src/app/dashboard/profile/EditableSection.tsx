"use client";

import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProfileFormField, ProfileFormValues } from "@/app/onboarding/coach/ProfileForm";
import ProfileForm from "@/app/onboarding/coach/ProfileForm";
import AvailabilityForm, { type Slot } from "@/app/onboarding/coach/AvailabilityForm";
import { secondaryButtonClass, quietLinkClass } from "@/lib/ui";

/** Lets an editor inside a section close it after a successful save. */
const SectionDone = createContext<() => void>(() => {});
export const useSectionDone = () => useContext(SectionDone);

/**
 * One section of the coach's own profile: the read view (rendered on the server exactly as
 * families see it) with an Edit button that swaps in the form. After a save the page refreshes,
 * so the read view always shows what's actually stored.
 */
export default function EditableSection({
  id,
  title,
  note,
  children,
  editor,
}: {
  id: string;
  title: string;
  /** A line under the heading, e.g. what an edit does and doesn't change. */
  note?: ReactNode;
  children: ReactNode;
  /** The form, which calls useSectionDone() after saving. Omit when the section isn't edited here. */
  editor?: ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const panelId = useId();

  // Close in the same transition as the refresh, so the section never flashes the old values.
  function done() {
    startTransition(() => {
      router.refresh();
      setEditing(false);
    });
  }

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t-2 border-line pt-6 first:border-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="font-display text-3xl text-ink">{title}</h2>
        {editor && (
          <button
            type="button"
            className={editing ? quietLinkClass : secondaryButtonClass}
            aria-expanded={editing}
            aria-controls={panelId}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? "Cancel" : "Edit"}
            <span className="sr-only"> {title.toLowerCase()}</span>
          </button>
        )}
      </div>
      {note && <p className="-mt-1 mb-3 text-sm text-muted-foreground">{note}</p>}
      <div id={panelId}>
        {editing && editor ? (
          <SectionDone.Provider value={done}>
            <div className="card-flat p-4 sm:p-5">{editor}</div>
          </SectionDone.Provider>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** The onboarding profile form, limited to some fields, saving through the same endpoint. */
export function ProfileFieldsEditor({
  initial,
  fields,
  submitLabel,
  isMinorCoach,
}: {
  initial: ProfileFormValues;
  fields: ProfileFormField[];
  submitLabel: string;
  isMinorCoach: boolean;
}) {
  const done = useSectionDone();
  return <ProfileForm initial={initial} fields={fields} submitLabel={submitLabel} onSaved={done} isMinorCoach={isMinorCoach} />;
}

/** The whole profile form, for a coach who hasn't filled in every basic yet. */
export function BasicsEditor({ initial, isMinorCoach }: { initial: ProfileFormValues; isMinorCoach: boolean }) {
  const router = useRouter();
  return <ProfileForm initial={initial} submitLabel="Save basics" onSaved={() => router.refresh()} isMinorCoach={isMinorCoach} />;
}

export function AvailabilityEditor({ initial }: { initial: Slot[] }) {
  const done = useSectionDone();
  return <AvailabilityForm initial={initial} onSaved={done} />;
}
