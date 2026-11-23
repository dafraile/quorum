// A local, in-browser first pass at removing direct identifiers from a pasted case before
// anything is sent to a model. Pattern-based: it catches common formats (names after titles,
// dates, Australian health identifiers, phones, emails, addresses, facilities) and leaves age,
// sex, occupation and relative time alone, because the panel needs them. It is a safety net,
// not a guarantee: the clinician reviews every redaction and must confirm the result.
// The OpenMed model is the planned next layer.

export type RedactionKind =
  | "name"
  | "date"
  | "medicare"
  | "ihi"
  | "dva"
  | "health-id"
  | "phone"
  | "email"
  | "address"
  | "postcode"
  | "facility"
  | "url"
  | "number"
  | "manual";

export type Redaction = { id: string; start: number; end: number; original: string; kind: RedactionKind };

export const kindLabels: Record<RedactionKind, string> = {
  name: "Name",
  date: "Date",
  medicare: "Medicare number",
  ihi: "IHI",
  dva: "DVA number",
  "health-id": "Record number",
  phone: "Phone",
  email: "Email",
  address: "Address",
  postcode: "Place",
  facility: "Facility",
  url: "Web address",
  number: "Long number",
  manual: "Your redaction",
};

/** What a redaction becomes in the text sent to the panel. */
export const placeholder = (kind: RedactionKind) =>
  ({
    name: "[name]",
    date: "[date]",
    medicare: "[Medicare no.]",
    ihi: "[IHI]",
    dva: "[DVA no.]",
    "health-id": "[record no.]",
    phone: "[phone]",
    email: "[email]",
    address: "[address]",
    postcode: "[place]",
    facility: "[facility]",
    url: "[link]",
    number: "[number]",
    manual: "[removed]",
  })[kind];

const months = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const streetTypes =
  "St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Lane|Ln|Ct|Court|Pl|Place|Way|Cres|Crescent|Pde|Parade|Hwy|Highway|Tce|Terrace|Blvd|Boulevard|Cct|Circuit|Close|Cl|Grove|Gr|Square|Sq";
const name = "[A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)?";
const relations = "wife|husband|partner|son|daughter|mother|father|mum|mom|dad|brother|sister|carer|friend|neighbour|neighbor|grandson|granddaughter";

/**
 * Ordered patterns. Each may use a capture group to redact only part of the match
 * (the name after "Mr", not the title). Earlier patterns win where matches overlap.
 */
const patterns: Array<{ kind: RedactionKind; pattern: RegExp; group?: number }> = [
  { kind: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "url", pattern: /\bhttps?:\/\/\S+|\bwww\.\S+/gi },
  // Individual Healthcare Identifier: 16 digits starting 800360.
  { kind: "ihi", pattern: /\b8003\s?60\d{2}\s?\d{4}\s?\d{4}\b/g },
  // Medicare: 10 digits (often 4-5-1) with an optional reference number.
  { kind: "medicare", pattern: /\b[2-6]\d{3}[\s-]?\d{5}[\s-]?\d(?:[\s/-]\d)?\b/g },
  { kind: "dva", pattern: /\b(DVA\s*(?:file\s*)?(?:no\.?|number|#)?\s*:?\s*[A-Z]{1,4}\s?\d{4,6}[A-Z]?)\b/gi, group: 1 },
  {
    kind: "health-id",
    pattern: /\b(?:MRN|URN|UR|NHI|Patient\s*ID|Hospital\s*(?:no\.?|number)|Record\s*(?:no\.?|number)|CRN|Pension\s*(?:no\.?|number)|Concession\s*(?:no\.?|number))\s*[:#]?\s*([A-Z0-9-]{4,})\b/gi,
    group: 1,
  },
  { kind: "phone", pattern: /(?:\+61\s?|\b0)[2-478](?:[\s-]?\d){8}\b/g },
  { kind: "phone", pattern: /\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b/g },
  // Dates: 3/4/2024, 03-04-24, 2024-04-03, 3 April 2024, April 3, 2024, 3rd of April.
  { kind: "date", pattern: /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g },
  { kind: "date", pattern: /\b\d{4}-\d{2}-\d{2}\b/g },
  { kind: "date", pattern: new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+(?:${months})\\.?(?:,?\\s+\\d{4})?\\b`, "g") },
  { kind: "date", pattern: new RegExp(`\\b(?:${months})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "g") },
  {
    kind: "address",
    pattern: new RegExp(`\\b(?:(?:Unit|Apt|Flat)\\s*\\d+[A-Z]?[,/]?\\s*)?\\d{1,5}[A-Z]?(?:[-/]\\d{1,5})?\\s+${name}(?:\\s+${name}){0,3}\\s+(?:${streetTypes})\\b\\.?`, "g"),
  },
  { kind: "address", pattern: /\b(?:PO|P\.O\.)\s*Box\s+\d+\b/gi },
  { kind: "postcode", pattern: new RegExp(`\\b(?:${name}\\s+){0,2}(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\\s+\\d{4}\\b`, "g") },
  {
    kind: "facility",
    pattern: new RegExp(
      `\\b(?:${name}|St\\.?)(?:\\s+(?:${name}|St\\.?|of|and|&)){0,4}\\s+(?:Hospital|Clinic|Medical Centre|Medical Center|Health Centre|Health Service|Private Hospital|Aged Care|Nursing Home|Surgery|Practice|Pharmacy)\\b`,
      "g",
    ),
  },
  // Names: after a title, after "Name:", "named", "called", or a relation ("his wife Mary").
  { kind: "name", pattern: new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Professor|Sister|Nurse|Doctor)\\.?\\s+(${name}(?:\\s+${name})?)`, "g"), group: 1 },
  { kind: "name", pattern: new RegExp(`\\b(?:Patient(?:\\s+name)?|Name|Surname|First name|Given name)\\s*:\\s*(${name}(?:\\s+${name}){0,2})`, "gi"), group: 1 },
  { kind: "name", pattern: new RegExp(`\\b(?:named|called|known as)\\s+(${name}(?:\\s+${name})?)`, "g"), group: 1 },
  { kind: "name", pattern: new RegExp(`\\b(?:his|her|their|the patient's|patient's)\\s+(?:${relations})\\s*,?\\s+(${name}(?:\\s+${name})?)`, "gi"), group: 1 },
  // Anything else that looks like an identifier: eight or more digits in a row.
  { kind: "number", pattern: /\b\d(?:[\s-]?\d){7,}\b/g },
];

/** Words a name pattern may catch that are not names. */
const notNames = new Set([
  "The",
  "This",
  "That",
  "He",
  "She",
  "They",
  "His",
  "Her",
  "Has",
  "Had",
  "Was",
  "Is",
  "And",
  "But",
  "Not",
  "No",
  "Yes",
  "Today",
  "Yesterday",
  "Tomorrow",
  "Hospital",
  "Clinic",
  "Practice",
]);

let counter = 0;
const nextId = () => `r${(counter += 1)}`;

export const findRedactions = (text: string): Redaction[] => {
  const found: Redaction[] = [];
  const overlaps = (start: number, end: number) => found.some((item) => start < item.end && end > item.start);
  for (const { kind, pattern, group } of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const whole = match[0];
      const part = group ? match[group] : whole;
      if (!part) continue;
      const offset = group ? whole.indexOf(part) : 0;
      const start = (match.index ?? 0) + offset;
      const end = start + part.length;
      if (kind === "name" && notNames.has(part.split(/\s+/)[0])) continue;
      if (overlaps(start, end)) continue;
      found.push({ id: nextId(), start, end, original: part, kind });
    }
  }
  // The same name appearing elsewhere on its own ("Mary said…") is redacted too.
  for (const item of [...found]) {
    if (item.kind !== "name") continue;
    for (const piece of item.original.split(/\s+/)) {
      if (piece.length < 3 || notNames.has(piece)) continue;
      const again = new RegExp(`\\b${piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      for (const match of text.matchAll(again)) {
        const start = match.index ?? 0;
        const end = start + piece.length;
        if (!overlaps(start, end)) found.push({ id: nextId(), start, end, original: piece, kind: "name" });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
};

/** A redaction the clinician adds by selecting text. Returns null when it overlaps an existing one. */
export const manualRedaction = (text: string, start: number, end: number, existing: Redaction[]): Redaction | null => {
  const trimmedStart = start + (text.slice(start, end).length - text.slice(start, end).trimStart().length);
  const trimmedEnd = end - (text.slice(start, end).length - text.slice(start, end).trimEnd().length);
  if (trimmedEnd <= trimmedStart) return null;
  if (existing.some((item) => trimmedStart < item.end && trimmedEnd > item.start)) return null;
  return { id: nextId(), start: trimmedStart, end: trimmedEnd, original: text.slice(trimmedStart, trimmedEnd), kind: "manual" };
};

/** The text with every active redaction replaced by its placeholder. */
export const applyRedactions = (text: string, redactions: Redaction[], released: Set<string>) => {
  let out = "";
  let cursor = 0;
  for (const item of [...redactions].sort((a, b) => a.start - b.start)) {
    if (released.has(item.id)) continue;
    out += text.slice(cursor, item.start) + placeholder(item.kind);
    cursor = item.end;
  }
  return out + text.slice(cursor);
};
