/** Full verbatim record transcriptions, parsed upstream from the
 *  research repo's transcriptions file by scripts/parse_transcriptions.py.
 *
 *  The stories are the trailer; these are the film. A packet with no
 *  transcriptions is allowed, and every surface that shows records
 *  renders nothing for it.
 */

import { packetFile } from "@/lib/packet";

export interface RecordDoc {
  id: string;
  title: string;
  people: string[];
  record: string;
  source: string;
  grade: string;
  /** The first story this record serves, kept for one-story callers. */
  story: string | null;
  /** Every story it serves: one probate abstract can be the paper two
   *  stories are arguing about. */
  stories: string[];
  /** Research cycles this record was transcribed for. A record can belong
   *  to a cycle and to no story at all: the expansion rounds transcribed
   *  the paper that settled a parentage question, which is read on the
   *  people's own pages. */
  cycles: string[];
  glossaryCandidates: string;
  text: string;
  pullQuotes: string[];
}

export const records: RecordDoc[] = packetFile<{ records: RecordDoc[] }>("transcriptions", {
  records: [],
}).records;

const byStory = new Map<string, RecordDoc[]>();
const byPerson = new Map<string, RecordDoc[]>();
for (const r of records) {
  for (const sid of r.stories?.length ? r.stories : r.story ? [r.story] : []) {
    byStory.set(sid, [...(byStory.get(sid) ?? []), r]);
  }
  for (const pid of r.people) {
    byPerson.set(pid, [...(byPerson.get(pid) ?? []), r]);
  }
}

export const recordsForStory = (id: string): RecordDoc[] => byStory.get(id) ?? [];
export const recordsForPerson = (id: string): RecordDoc[] => byPerson.get(id) ?? [];
