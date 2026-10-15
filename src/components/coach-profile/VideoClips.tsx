import type { ReactNode } from "react";
import type { CoachProfile } from "@/generated/prisma/client";
import type { BioVideoClipType } from "@/lib/uploadRules";

export type VideoClip = { type: BioVideoClipType; label: string; url: string };

/** The coach's saved clips, in display order. */
export function videoClips(p: Pick<CoachProfile, "introClipUrl" | "coachingClipUrl" | "playingClipUrl">): VideoClip[] {
  const all: { type: BioVideoClipType; label: string; url: string | null }[] = [
    { type: "intro", label: "Introduction", url: p.introClipUrl },
    { type: "coaching", label: "Coaching", url: p.coachingClipUrl },
    { type: "playing", label: "Playing", url: p.playingClipUrl },
  ];
  return all.filter((c): c is VideoClip => Boolean(c.url));
}

/** Bio video clips as families see them. `action` adds a control under each clip (the coach's own view). */
export default function VideoClips({
  clips,
  firstName,
  action,
}: {
  clips: VideoClip[];
  firstName: string;
  action?: (clip: VideoClip) => ReactNode;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {clips.map((clip) => (
        <figure key={clip.type}>
          <video
            controls
            preload="metadata"
            aria-label={`${firstName} — ${clip.label.toLowerCase()} clip`}
            className="aspect-video w-full rounded-lg border-2 border-ink bg-ink shadow-patch-sm"
            src={clip.url}
          />
          <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="eyebrow text-muted-foreground">{clip.label}</span>
            {action?.(clip)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
