"use client";

import { useState, useRef } from "react";
import Badge from "@/components/Badge";
import { secondaryButtonClass, errorClass } from "@/lib/ui";

export default function IntroVideoUpload({
  initialUrl,
  initialSeconds,
}: {
  initialUrl: string | null;
  initialSeconds: number | null;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [seconds, setSeconds] = useState(initialSeconds);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoProbeRef = useRef<HTMLVideoElement | null>(null);

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
      if (duration > 30) {
        setError(`This video is ${Math.round(duration)}s — trim it to 30 seconds or less.`);
        setLoading(false);
        return;
      }
      const form = new FormData();
      form.append("file", file);
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
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden probe element used only to read the file's duration client-side before upload. */}
      <video ref={videoProbeRef} className="hidden" muted />

      <p className="text-sm text-muted-foreground">
        Optional: a 30-second video intro builds trust fast — say hi, mention your sport, and what a session
        looks like.
      </p>
      {error && <p className={errorClass}>{error}</p>}

      {url && (
        <div className="flex items-center gap-3">
          <video controls className="h-32 w-32 rounded-lg border-2 border-ink object-cover" src={url} />
          <Badge variant="success">{seconds}s intro uploaded</Badge>
        </div>
      )}

      <label className={`${secondaryButtonClass} w-fit cursor-pointer`}>
        {loading ? "Uploading..." : url ? "Replace video" : "Upload intro video"}
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
