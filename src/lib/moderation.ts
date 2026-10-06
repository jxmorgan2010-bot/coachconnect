/**
 * Off-platform contact detection. Server-only: this file must never be imported by a
 * client component, or the patterns would ship in the browser bundle and be easy to
 * route around. Enforcement (strikes, suspension, logging) lives in contactPolicy.ts.
 *
 * Approach: build a few normalized "views" of the text (spelled-out digits turned into
 * digits, spaced-out letters re-joined, "at"/"dot" turned into @/.), then look for
 * phone numbers, emails, links, handles, other platforms, payment apps and
 * "contact me" phrasing. Every rule is written to leave times (5:30), prices ($45),
 * session counts, dates, zip codes, jersey numbers and place names alone.
 */

export type ContactCategory =
  | "phone"
  | "email"
  | "link"
  | "handle"
  | "platform"
  | "payment_app"
  | "contact_phrase";

export type ContactCheck = { flagged: boolean; categories: ContactCategory[] };

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  // spellings people use to dodge digit filters
  won: "1", too: "2", to: "2", for: "4", fore: "4", ate: "8", niner: "9", oh: "0",
};

// Number words that are also everyday English only count when they sit between other
// digits/number words (see spelledOutToDigits).
const AMBIGUOUS_NUMBER_WORDS = new Set(["won", "too", "to", "for", "fore", "ate", "oh"]);

// Money amounts are removed before looking for phone numbers so "$202.50 for 5" can't
// combine into a 7-digit run.
const MONEY = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;

// Email addresses can end in anything on this list. Bare domains are stricter: short
// endings that are also words (".to", ".so", ".me") show up by accident when someone
// skips the space after a full stop ("ok.so"), so those only count with a path after.
const TLDS =
  "com|net|org|edu|gov|io|co|us|me|app|ly|gg|tv|info|biz|link|xyz|site|online|page|dev|ai|ca|uk|bio|to|cc|so|fm|club|store|shop|ee";
const STRONG_TLDS = "com|net|org|edu|gov|biz|xyz|info";

/** Strip accents, zero-width characters and fancy unicode so lookalikes match. */
function baseNormalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[​-‏⁠﻿]/g, "")
    .toLowerCase();
}

/** "v e n m o" / "v.e.n.m.o" / "i-n-s-t-a" → joined, without gluing normal words together. */
function joinSpacedLetters(text: string): string {
  return text.replace(/\b(?:[a-z0-9][\s.\-_*]){2,}[a-z0-9]\b/g, (m) => m.replace(/[\s.\-_*]/g, ""));
}

const SEPARATOR_TOKEN = /^(\s+|[-,.()/])$/;

/**
 * Turn number words into digits. Unambiguous words ("five") always convert; ambiguous
 * ones ("to", "for", "won") only convert when the nearest real token on both sides is a
 * digit or number word, so "go to the park for practice" is untouched.
 */
function spelledOutToDigits(text: string): string {
  const tokens = text.split(/(\s+|[-,.()/])/).filter((t) => t !== "");
  const isNumberish = (t: string | undefined) =>
    t !== undefined && (/^\d+$/.test(t) || (t in NUMBER_WORDS && !AMBIGUOUS_NUMBER_WORDS.has(t)));
  const neighbour = (i: number, step: 1 | -1) => {
    for (let j = i + step; j >= 0 && j < tokens.length; j += step) {
      if (!SEPARATOR_TOKEN.test(tokens[j])) return tokens[j];
    }
    return undefined;
  };
  return tokens
    .map((t, i) => {
      if (!(t in NUMBER_WORDS)) return t;
      if (!AMBIGUOUS_NUMBER_WORDS.has(t)) return NUMBER_WORDS[t];
      return isNumberish(neighbour(i, -1)) && isNumberish(neighbour(i, 1)) ? NUMBER_WORDS[t] : t;
    })
    .join("");
}

/** "name at gmail dot com", "name (at) gmail [dot] com", "name @ gmail . com" → name@gmail.com */
function deobfuscateEmail(text: string): string {
  return text
    .replace(/\s*[([{<]\s*(?:at|@)\s*[)\]}>]\s*/g, "@")
    .replace(/\s*[([{<]\s*(?:dot|\.)\s*[)\]}>]\s*/g, ".")
    .replace(/\s+@\s+/g, "@")
    .replace(/(\w)\s+at\s+(\w+)\s+dot\s+(\w+)/g, "$1@$2.$3")
    .replace(/(\w)\s*@\s*(\w+)\s+dot\s+(\w+)/g, "$1@$2.$3")
    .replace(/(\w)\s+dot\s+(com|net|org|edu|io|co|us|me)\b/g, "$1.$2");
}

// Phone: 7+ digits in one run, allowing the separators people put between digits.
// Times (5:30) and prices ($1,200) use ":" "," "$", which aren't separators here.
const PHONE_RUN = /(?:\+?\d[\s.\-()/\\_*]{0,4}){7,}/g;
// Calendar dates are digit runs too: 10/14/2026, 10-14-26, 2026-10-14.
const DATES = /\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}[/.-]\d{1,2}[/.-]\d{1,2})\b/g;

function hasPhone(view: string): boolean {
  // Letters standing in for digits ("4l5 555 OI23"): any chunk made only of digits and
  // o/i/l/| that contains at least one real digit is read as a number.
  const deLeet = view.replace(/\b[\doil|]{2,}\b/g, (chunk) =>
    /\d/.test(chunk) ? chunk.replace(/o/g, "0").replace(/[il|]/g, "1") : chunk,
  );
  for (const m of deLeet.replace(DATES, " ").matchAll(PHONE_RUN)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length < 7) continue;
    const groups = m[0].split(/\D+/).filter(Boolean);
    // A list of zip codes ("94110 94112") — US phone numbers never group digits in fives.
    if (groups.every((g) => g.length === 5)) continue;
    // A pair of years ("2025-2026").
    if (/^(19|20)\d\d(19|20)\d\d$/.test(digits)) continue;
    // Short numbers separated by spaces ("ages 8 10 12 14") under 10 digits read as a
    // list, not a phone number. A fully spaced-out 10-digit number is still caught.
    if (digits.length < 10 && groups.length >= 3 && groups.every((g) => g.length <= 2)) continue;
    return true;
  }
  return false;
}

const EMAIL = new RegExp(`[a-z0-9._%+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b`);
const EMAIL_PROVIDERS = /\b(gmail|g mail|yahoo|hotmail|outlook|icloud|aol|protonmail|proton mail)\b/;

const LINK = new RegExp(
  [
    `https?://|www\\.`,
    // common endings: always a link
    `\\b[a-z0-9][a-z0-9-]{1,62}\\.(?:${STRONG_TLDS})\\b(?!\\.[a-z])`,
    // endings that double as words: only when a path follows ("bit.ly/x", "linktr.ee/x")
    `\\b[a-z0-9][a-z0-9-]{1,62}\\.(?:${TLDS})/\\S`,
  ].join("|"),
);

// @handle, but not "@ 5pm", "@5:30", "@the park" or "@school".
const HANDLE =
  /(^|[^a-z0-9.])@(?!\d{1,2}(:\d{2})?\s?(am|pm)?\b)(?!(?:the|a|an|my|your|our|home|school|park|field|gym|court|courts|noon|night|practice|lunch|dinner|work|rec|center)\b)[a-z_][a-z0-9_.]{1,29}/;

// Platform names that are never normal coaching vocabulary.
const PLATFORMS =
  /\b(insta(gram)?|snapchat|what'?s\s?app|telegram|tik\s?tok|facebook|fb\s?messenger|discord|wechat|kik|imessage|facetime|groupme|twitter|viber|skype|linktree|linktr\.?ee|onlyfans)\b/;
// Words that are also sports vocabulary ("snap count", "hand signals", "free-throw line")
// only count when used as a contact channel.
const AMBIGUOUS_PLATFORM_USE =
  /\b(?:(?:add|follow|find|hit|message|msg|dm|text|reach|contact|ping)\s+(?:me|us)\s+(?:up\s+)?(?:on|at|via|thru|through)\s+(?:snap|ig|fb|signal|x|line|insta|threads)\b|(?:my|his|her|our)\s+(?:snap|ig|fb|insta|signal)(?:\s+(?:is|handle|name|username))?\s*[:=-]?\s+@?\w)/;

const PAYMENT_APPS = /(\b(venmo|zelle|cash\s?app|paypal|pay\s?pal|apple\s?cash|cashtag)\b|(^|\s)\$[a-z][a-z0-9_]{2,}\b)/;

const CONTACT_PHRASES = new RegExp(
  [
    // "text me", "call me", "dm me" — but not "call me Coach Sam"
    String.raw`\b(text|txt|call|ring|dm|pm|whatsapp|facetime|email|e-mail)\s+(me|us|my\s+(mom|dad|parent)s?)\b(?!\s+(coach|mr|ms|mrs|miss|by)\b)`,
    String.raw`\bhit\s+me\s+up\b`,
    // "my cell is", "my phone number" — but not "my phone died" or "my number is 23"
    String.raw`\b(my|our)\s+(cell|phone|mobile)(\s*(number|#|no\.?))?\s*(is|:|=)`,
    String.raw`\b(my|our)\s+(cell|phone|mobile)\s+(number|#)\b`,
    String.raw`\b(my|our)\s+(email|e-mail|snap|socials?|username|digits)(\s+address)?\s*(is|are|:|=)`,
    String.raw`\bmy\s+socials\b`,
    String.raw`\b(your|ur)\s+(cell|phone|mobile)\s+(number|#)\b`,
    String.raw`\breach\s+(me|us)\s+(at|on|via|directly)\b`,
    String.raw`\bcontact\s+(me|us)\s+(at|on|via|directly|outside)\b`,
    String.raw`\b(off|outside(\s+of)?)\s+(the\s+)?(app|platform|site|coachconnect)\b`,
    String.raw`\bpay\s+(me|you|us)\s+(directly|in\s+cash|cash|outside|off)\b`,
    String.raw`\b(cash|venmo)\s+only\b`,
  ].join("|"),
);

/** Run every rule over the text. Pure function: no I/O, safe to unit test. */
export function checkForContactInfo(raw: string): ContactCheck {
  if (!raw || !raw.trim()) return { flagged: false, categories: [] };

  const base = baseNormalize(raw);
  const joined = joinSpacedLetters(base);
  const digitsView = spelledOutToDigits(joined.replace(MONEY, " "));
  const emailView = deobfuscateEmail(joined);

  const categories = new Set<ContactCategory>();
  if (hasPhone(digitsView)) categories.add("phone");
  const hasEmail = EMAIL.test(emailView);
  if (hasEmail || EMAIL_PROVIDERS.test(joined)) categories.add("email");
  if (!hasEmail && LINK.test(emailView)) categories.add("link");
  if (HANDLE.test(base)) categories.add("handle");
  if (PLATFORMS.test(joined) || AMBIGUOUS_PLATFORM_USE.test(joined)) categories.add("platform");
  if (PAYMENT_APPS.test(joined)) categories.add("payment_app");
  if (CONTACT_PHRASES.test(joined)) categories.add("contact_phrase");

  return { flagged: categories.size > 0, categories: [...categories] };
}

/** Convenience for forms with several free-text fields. Empty/undefined fields are skipped. */
export function checkFields(fields: (string | null | undefined)[]): ContactCheck {
  const categories = new Set<ContactCategory>();
  for (const f of fields) {
    if (!f) continue;
    for (const c of checkForContactInfo(f).categories) categories.add(c);
  }
  return { flagged: categories.size > 0, categories: [...categories] };
}
