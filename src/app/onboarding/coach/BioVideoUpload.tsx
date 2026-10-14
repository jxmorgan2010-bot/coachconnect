"use client";

import { useState, useRef } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";
import { MAX_CLIP_SECONDS as MAX_SECONDS, type BioVideoClipType } from "@/lib/uploadRules";
import { uploadCoachFile } from "@/lib/coachUpload";

const CLIP_META: Record<BioVideoClipType, { title: string; instructions: string }> = {
  intro: {
    title: "Personal introduction",
    instructions: "Say hi, share your background, and what a session with you looks like.",
  },
  coaching: {
    title: "Coaching in action",
    instructions: "A clip of you coaching or teaching another player.",
  },
  playing: {
    title: "Playing the sport",
    instructions: "A clip of you playing your sport.",
  },
};

type ClipState = { url: string | null; seconds: number | null };

function ClipUploader({
  clipType,
  initial,
  onSaved,
}: {
  clipType: BioVideoClipType;
  initial: ClipState;
  onSaved: (clip: ClipState) => void;
}) {
  const [url, setUrl] = useState(initial.url);
  const [seconds, setSeconds] = useState(initial.seconds);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoProbeRef = useRef<HTMLVideoElement | null>(null);
  const meta = CLIP_META[clipType];

  function readDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = videoProbeRef.current;
      if (!video) return reject(new Error("Couldn't read video."));
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(objectUrl);
      };
      video.onerror = () => {
        reject(new Error("Couldn't read video."));
        URL.revokeObjectURL(objectUrl);
      };
    });
  }

  async function onFileChosen(file: File) {
    setError(null);
    setLoading(true);
    try {
      const duration = await readDuration(file);
      if (duration > MAX_SECONDS) {
        setError(`This clip is ${Math.round(duration)}s — trim it to ${MAX_SECONDS} seconds or less.`);
        setLoading(false);
        return;
      }
      const result = await uploadCoachFile("video", file, { clipType, durationSeconds: Math.round(duration) });
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const savedUrl = result.url ?? null;
      setUrl(savedUrl);
      setSeconds(Math.round(duration));
      onSaved({ url: savedUrl, seconds: Math.round(duration) });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-line bg-chalk p-4">
      {/* Hidden probe element used only to read the file's duration client-side before upload. */}
      <video ref={videoProbeRef} className="hidden" muted />

      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg leading-none text-ink">{meta.title}</h3>
        {url ? <Badge variant="success">Uploaded{seconds ? ` · ${seconds}s` : ""}</Badge> : <Badge>Not uploaded</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{meta.instructions}</p>
      {error && <p className={errorClass}>{error}</p>}

      {url && (
        <video controls className="h-32 w-full rounded-lg border-2 border-ink object-cover" src={url} />
      )}

      <label className={`${secondaryButtonClass} w-fit cursor-pointer has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink`}>
        {loading ? "Uploading..." : url ? "Re-record / replace" : "Upload clip"}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="sr-only"
          disabled={loading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChosen(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

export default function BioVideoUpload({
  initial,
}: {
  initial: Record<BioVideoClipType, ClipState>;
}) {
  const [clips, setClips] = useState(initial);
  const allUploaded = Boolean(clips.intro.url && clips.coaching.url && clips.playing.url);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Optional: record a short bio video in three separate clips (60 seconds each, max). Upload all three to add
        a &quot;Video intro&quot; badge to your profile — it&apos;s not required to go
        live. You can re-record any single clip later without redoing the others.
      </p>
      {allUploaded && <Badge variant="success">All three clips uploaded — your profile shows a &quot;Video intro&quot; badge</Badge>}

      <div className="grid gap-4 sm:grid-cols-3">
        {(["intro", "coaching", "playing"] as const).map((clipType) => (
          <ClipUploader
            key={clipType}
            clipType={clipType}
            initial={clips[clipType]}
            onSaved={(clip) => setClips((prev) => ({ ...prev, [clipType]: clip }))}
          />
        ))}
      </div>
    </div>
  );
}
