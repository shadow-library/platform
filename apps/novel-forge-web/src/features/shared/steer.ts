export interface SteerDraft {
  text: string;
  nudges: string[];
  keepAsDirection: boolean;
}

export interface SteerMessage {
  who: 'you' | 'coach';
  text: string;
}

export function toggleNudge(nudges: string[], nudge: string): string[] {
  return nudges.includes(nudge) ? nudges.filter(candidate => candidate !== nudge) : [...nudges, nudge];
}
