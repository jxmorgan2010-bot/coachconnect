/**
 * Makes an email safe to send without dropping it. Server-only: uses the contact-info filter
 * (src/lib/moderation.ts).
 *
 * The filter only says whether text is flagged, not where. So for each piece of the email
 * (subject, paragraph, button label, link labels, small print) that's flagged:
 *   1. split it into sentences and look only at the flagged ones;
 *   2. in a flagged sentence, scan words left to right to the first point where the text so far
 *      is flagged, then shrink from the left to the shortest run of words that's flagged on its
 *      own, and replace that run with REMOVED. Repeat until the sentence passes, so two problems
 *      in one sentence are removed separately and everything else stays;
 *   3. if that can't clear it, the whole sentence becomes REMOVED.
 * Then the whole email is checked again, as sendEmail() always has, which catches something
 * split across pieces (half a phone number in each of two paragraphs). If that still trips, the
 * shortest run of adjacent pieces is replaced. The subject and button label are never replaced
 * by this last step; each was already cleaned on its own.
 *
 * Links (our own, and the calendar links) are left out of every check, as before: they're built
 * by the app, and their parameters come from text that was already cleaned.
 */
import { checkForContactInfo, type ContactCategory } from "@/lib/moderation";
import type { Email } from "@/lib/email";

export const REMOVED = "[removed]";

export type TextReplacement = {
  /** Which piece: "subject", "paragraph 2", "button", "links intro", "link 1", "footnote", "whole email". */
  part: string;
  categories: ContactCategory[];
  originalText: string;
  sentText: string;
};

const LINK = /https?:\/\/\S+/g;

function check(text: string) {
  return checkForContactInfo(text.replace(LINK, " "));
}

const isFlagged = (text: string) => check(text).flagged;

/** Words and the whitespace between them, so text is rebuilt exactly. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t !== "");
}

const isSpace = (t: string) => /^\s+$/.test(t);

/** Replaces tokens from..to (inclusive, word indexes into `words`) with one REMOVED. */
function replaceRun(tokens: string[], wordIdx: number[], from: number, to: number): string[] {
  const start = wordIdx[from];
  const end = wordIdx[to];
  return [...tokens.slice(0, start), REMOVED, ...tokens.slice(end + 1)];
}

/** The shortest run of words to remove so this sentence passes, applied repeatedly. */
export function cleanSentence(sentence: string): string {
  let tokens = tokenize(sentence);
  // Each round replaces at least one real word, so this always ends; the cap is a backstop.
  for (let round = 0; round < 50; round++) {
    const text = tokens.join("");
    if (!isFlagged(text)) return text;
    const wordIdx = tokens.map((t, i) => (isSpace(t) || t === REMOVED ? -1 : i)).filter((i) => i >= 0);
    if (wordIdx.length === 0) break;
    const upTo = (k: number) => tokens.slice(0, wordIdx[k] + 1).join("");
    const span = (j: number, k: number) => tokens.slice(wordIdx[j], wordIdx[k] + 1).join("");

    // First point where the text so far is flagged. Some rules look at what follows (a phrase
    // that ends a clause), so if no prefix is, the whole sentence is the window.
    let end = wordIdx.findIndex((_, k) => isFlagged(upTo(k)));
    if (end === -1) end = wordIdx.length - 1;
    // Shrink from the left while the run is still flagged on its own.
    let start = 0;
    while (start < end && isFlagged(span(start + 1, end))) start++;
    if (!isFlagged(span(start, end))) {
      // Only flagged in context: take everything up to `end`.
      start = 0;
    }
    tokens = replaceRun(tokens, wordIdx, start, end);
  }
  return isFlagged(tokens.join("")) ? REMOVED : tokens.join("");
}

/** Cleans one piece of text sentence by sentence. Returns null when nothing needed changing. */
export function cleanText(text: string): string | null {
  if (!isFlagged(text)) return null;
  // Keep the separators (sentence ends and line breaks) so the text reads the same.
  const pieces = text.split(/((?<=[.!?])\s+|\s*\n+\s*)/);
  const cleaned = pieces.map((p, i) => (i % 2 === 1 || !p || !isFlagged(p) ? p : cleanSentence(p)));
  let result = cleaned.join("");
  // A match across two sentences: fall back to the word-level search on the whole piece.
  if (isFlagged(result)) result = cleanSentence(result);
  return result.replace(/(\[removed\]\s*){2,}/g, `${REMOVED} `).trim();
}

type Piece = { part: string; get: (e: Email) => string | undefined; set: (e: Email, v: string) => Email; protected?: boolean };

function pieces(email: Email): Piece[] {
  const list: Piece[] = [
    { part: "subject", get: (e) => e.subject, set: (e, v) => ({ ...e, subject: v }), protected: true },
    ...email.paragraphs.map(
      (_, i): Piece => ({
        part: `paragraph ${i + 1}`,
        get: (e) => e.paragraphs[i],
        set: (e, v) => ({ ...e, paragraphs: e.paragraphs.map((p, j) => (j === i ? v : p)) }),
      }),
    ),
  ];
  if (email.button) {
    list.push({ part: "button", get: (e) => e.button?.label, set: (e, v) => ({ ...e, button: { ...e.button!, label: v } }), protected: true });
  }
  if (email.links) {
    list.push({ part: "links intro", get: (e) => e.links?.intro, set: (e, v) => ({ ...e, links: { ...e.links!, intro: v } }) });
    email.links.items.forEach((_, i) =>
      list.push({
        part: `link ${i + 1}`,
        get: (e) => e.links?.items[i]?.label,
        set: (e, v) => ({ ...e, links: { ...e.links!, items: e.links!.items.map((l, j) => (j === i ? { ...l, label: v } : l)) } }),
      }),
    );
  }
  if (email.footnote !== undefined) {
    list.push({ part: "footnote", get: (e) => e.footnote, set: (e, v) => ({ ...e, footnote: v }) });
  }
  return list;
}

/** Everything sendEmail() checks, in the order renderText() lays it out (links removed). */
function wholeText(email: Email, render: (e: Email) => string): string {
  return `${email.subject}\n${render(email)}`;
}

/**
 * The email with only the offending text replaced, and a record of each replacement. An email
 * that was already clean comes back unchanged with no replacements.
 */
export function makeEmailSafe(email: Email, render: (e: Email) => string): { email: Email; replacements: TextReplacement[] } {
  let out = email;
  const replacements: TextReplacement[] = [];

  for (const piece of pieces(email)) {
    const original = piece.get(out);
    if (!original) continue;
    const categories = check(original).categories;
    const cleaned = cleanText(original);
    if (cleaned === null) continue;
    out = piece.set(out, cleaned);
    replacements.push({ part: piece.part, categories, originalText: original, sentText: cleaned });
  }

  // Something split across pieces. Replace the shortest run of adjacent unprotected pieces.
  const whole = wholeText(out, render);
  if (isFlagged(whole)) {
    const categories = check(whole).categories;
    const list = pieces(out).filter((p) => !p.protected && p.get(out));
    const blank = (e: Email, from: number, to: number) =>
      list.slice(from, to + 1).reduce((acc, p) => p.set(acc, REMOVED), e);
    let best: [number, number] | null = null;
    for (let len = 1; len <= list.length && !best; len++) {
      for (let from = 0; from + len <= list.length; from++) {
        if (!isFlagged(wholeText(blank(out, from, from + len - 1), render))) {
          best = [from, from + len - 1];
          break;
        }
      }
    }
    const [from, to] = best ?? [0, list.length - 1];
    const before = list.slice(from, to + 1).map((p) => p.get(out)).join("\n");
    out = blank(out, from, to);
    replacements.push({ part: "whole email", categories, originalText: before, sentText: REMOVED });
  }

  return { email: out, replacements };
}
