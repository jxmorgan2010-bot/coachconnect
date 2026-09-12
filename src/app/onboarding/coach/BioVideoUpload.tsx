"use client";

import { useState, useRef } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";
import type { BioVideoClipType } from "@/lib/storage";

const MAX_SECONDS = 60;

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
      const form = new FormData();
      form.append("file", file);
      form.append("clipType", clipType);
      form.append("durationSeconds", String(Math.round(duration)));
      const res = await fetch("/api/coach/upload-video", { method: "POST", body: form });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setUrl(data.url);
      setSeconds(Math.round(duration));
      onSaved({ url: data.url, seconds: Math.round(duration) });
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      {/* Hidden probe element used only to read the file's duration client-side before upload. */}
      <video ref={videoProbeRef} className="hidden" muted />

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-secondary">{meta.title}</h3>
        {url ? <Badge variant="success">Uploaded{seconds ? ` · ${seconds}s` : ""}</Badge> : <Badge>Not uploaded</Badge>}
      </div>
      <p className="text-xs text-muted-foreground">{meta.instructions}</p>
      {error && <p className={errorClass}>{error}</p>}

      {url && (
        <video controls className="h-32 w-full rounded-lg border-2 border-ink object-cover" src={url} />
      )}

      <label className={`${secondaryButtonClass} w-fit cursor-pointer`}>
        {loading ? "Uploading..." : url ? "Re-record / replace" : "Upload clip"}
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          className="hidden"
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
        Optional: record a short bio video in three separate clips (60 seconds each, max). Upload all three to earn
        a &quot;Video verified&quot; badge on your profile — it&apos;s purely a trust boost, not required to go
        live. You can re-record any single clip later without redoing the others.
      </p>
      {allUploaded && <Badge variant="success">Video verified — all three clips uploaded</Badge>}

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
