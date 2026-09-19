/** Original-record quotes and the period-language glossary.
 *
 *  Both files are hand-authored under data/ and gated by
 *  scripts/check_quotes.py: a quote must exist verbatim in the research
 *  corpus and a glossary term must occur somewhere in it. This module
 *  only shapes them for the surfaces; it adds nothing.
 */

import { packetFile } from "@/lib/packet";

export interface Quote {
  id: string;
  story: string | null;
  person: string | null;
  text: string;
  speaker: string;
  source: string;
  kind: string;
  grade: string;
  context?: string;
}

export interface GlossTerm {
  term: string;
  gloss: string;
}

export const quotes: Quote[] = packetFile<{ quotes: Quote[] }>("quotes", { quotes: [] }).quotes;
export const glossary: GlossTerm[] = packetFile<{ terms: GlossTerm[] }>("glossary", { terms: [] }).terms;

const byStory = new Map<string, Quote[]>();
const byPerson = new Map<string, Quote[]>();
for (const q of quotes) {
  if (q.story) byStory.set(q.story, [...(byStory.get(q.story) ?? []), q]);
  if (q.person) byPerson.set(q.person, [...(byPerson.get(q.person) ?? []), q]);
}

export const quotesForStory = (id: string): Quote[] => byStory.get(id) ?? [];
export const quotesForPerson = (id: string): Quote[] => byPerson.get(id) ?? [];

/** Longest terms first so "mean in estate" wins over any shorter overlap. */
const ordered = [...glossary].sort((a, b) => b.term.length - a.term.length);

/** The glossary terms that actually occur in a run of text, in the order
 *  they first appear. Case-insensitive, whole phrases. */
export function termsIn(text: string): GlossTerm[] {
  const lower = text.toLowerCase();
  return ordered
    .map((t) => ({ t, at: lower.indexOf(t.term.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.t);
}
