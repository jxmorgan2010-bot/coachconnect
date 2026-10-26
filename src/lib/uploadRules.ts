/**
 * File types, size limits and storage paths for coach uploads. Safe to import from client
 * components (no server-only imports), so the browser can reject a bad file before uploading
 * and the server can apply exactly the same rules.
 */

export const BIO_VIDEO_CLIP_TYPES = ["intro", "coaching", "playing"] as const;
export type BioVideoClipType = (typeof BIO_VIDEO_CLIP_TYPES)[number];

export const MAX_CLIP_SECONDS = 60;

export type UploadKind = "id" | "photo" | "video";
export const UPLOAD_KINDS: readonly UploadKind[] = ["id", "photo", "video"];

type UploadRule = {
  /** ID photos (school or government) go to the private store; photos and videos to the public one. */
  access: "private" | "public";
  /** Top-level folder in the store. Files land at `<folder>/<coachProfileId>/<name>-<random>.<ext>`. */
  folder: string;
  types: Record<string, string>; // content type -> file extension
  maxBytes: number;
  wrongTypeMessage: string;
  tooLargeMessage: string;
};

const IMAGE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
const VIDEO_MAX_BYTES = 50 * 1024 * 1024; // 50MB, generous for a 60s clip

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  id: {
    access: "private",
    folder: "id-verifications",
    types: IMAGE_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
    wrongTypeMessage: "Only JPEG, PNG, or WEBP images are allowed.",
    tooLargeMessage: "File is too large (8MB max).",
  },
  photo: {
    access: "public",
    folder: "coach-photos",
    types: IMAGE_TYPES,
    maxBytes: IMAGE_MAX_BYTES,
    wrongTypeMessage: "Only JPEG, PNG, or WEBP images are allowed.",
    tooLargeMessage: "File is too large (8MB max).",
  },
  video: {
    access: "public",
    folder: "coach-videos",
    types: VIDEO_TYPES,
    maxBytes: VIDEO_MAX_BYTES,
    wrongTypeMessage: "Only MP4, WEBM, or MOV videos are allowed.",
    tooLargeMessage: "Video is too large (50MB max — keep it under 60 seconds).",
  },
};

export function isUploadKind(value: unknown): value is UploadKind {
  return typeof value === "string" && (UPLOAD_KINDS as readonly string[]).includes(value);
}

export function isBioVideoClipType(value: unknown): value is BioVideoClipType {
  return typeof value === "string" && (BIO_VIDEO_CLIP_TYPES as readonly string[]).includes(value);
}

/** Returns a user-facing error if the file breaks the rules for `kind`, otherwise null. */
export function checkUploadFile(kind: UploadKind, file: { type: string; size: number }): string | null {
  const rule = UPLOAD_RULES[kind];
  if (!Object.hasOwn(rule.types, file.type)) return rule.wrongTypeMessage;
  if (file.size > rule.maxBytes) return rule.tooLargeMessage;
  return null;
}

/** The folder every upload of `kind` by this coach must sit in. */
export function coachUploadPrefix(kind: UploadKind, coachProfileId: string): string {
  return `${UPLOAD_RULES[kind].folder}/${coachProfileId}/`;
}

/**
 * The pathname the server asks the store to write to. The store appends a random suffix
 * before the extension, so re-uploads never overwrite each other.
 */
export function coachUploadPathname(
  kind: UploadKind,
  coachProfileId: string,
  contentType: string,
  clipType?: BioVideoClipType,
): string {
  const ext = UPLOAD_RULES[kind].types[contentType];
  const name = kind === "id" ? "school-id" : kind === "photo" ? "photo" : clipType ?? "clip";
  return `${coachUploadPrefix(kind, coachProfileId)}${name}.${ext}`;
}

/**
 * True when `pathname` is a single file directly inside this coach's folder for `kind`
 * (no `..`, no nested folders), so a coach can't confirm someone else's upload.
 */
export function isOwnUploadPathname(kind: UploadKind, coachProfileId: string, pathname: string): boolean {
  const prefix = coachUploadPrefix(kind, coachProfileId);
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("\\") && rest !== "." && rest !== "..";
}
