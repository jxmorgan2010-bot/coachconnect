import { put } from "@vercel/blob/client";
import { UPLOAD_RULES, checkUploadFile, type BioVideoClipType, type UploadKind } from "./uploadRules";
import type { GovernmentIdType } from "./coachTypes";

/** Browser side of the coach upload flow described in lib/storage.ts. */

const CONFIRM_URL: Record<UploadKind, string> = {
  id: "/api/coach/upload-id",
  photo: "/api/coach/upload-photo",
  video: "/api/coach/upload-video",
};

type UploadResult = { ok: true; url?: string } | { ok: false; error: string };

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function errorFrom(data: Record<string, unknown>): string {
  return typeof data.error === "string" ? data.error : "Upload failed.";
}

export async function uploadCoachFile(
  kind: UploadKind,
  file: File,
  {
    clipType,
    durationSeconds,
    documentType,
    onProgress,
  }: {
    clipType?: BioVideoClipType;
    durationSeconds?: number;
    /** IDs from experienced coaches: which government ID it is. */
    documentType?: GovernmentIdType;
    onProgress?: (percentage: number) => void;
  } = {},
): Promise<UploadResult> {
  const problem = checkUploadFile(kind, file);
  if (problem) return { ok: false, error: problem };

  try {
    const token = await postJson("/api/coach/upload-token", { kind, clipType, contentType: file.type, size: file.size });
    if (!token.ok) return { ok: false, error: errorFrom(token.data) };

    let blob;
    try {
      blob = await put(String(token.data.pathname), file, {
        access: UPLOAD_RULES[kind].access,
        token: String(token.data.clientToken),
        contentType: file.type,
        onUploadProgress: onProgress ? ({ percentage }) => onProgress(Math.round(percentage)) : undefined,
      });
    } catch {
      return { ok: false, error: "The upload didn't finish. Check your connection and try again." };
    }

    const saved = await postJson(CONFIRM_URL[kind], { pathname: blob.pathname, clipType, durationSeconds, documentType });
    if (!saved.ok) return { ok: false, error: errorFrom(saved.data) };
    return { ok: true, url: typeof saved.data.url === "string" ? saved.data.url : undefined };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection and try again." };
  }
}
