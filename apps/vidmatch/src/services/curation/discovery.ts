import type { VidMatchLevel } from '../videoContract.ts';
export type SearchIntent = {level: VidMatchLevel; topic: string; format: string; query: string};
const subjects = [
  ['daily life', 'a day in the life ordinary routines'], ['food', 'cooking a simple meal step by step'],
  ['travel', 'local travel story neighborhood tour'], ['nature', 'wildlife field scientist observation'],
  ['science', 'everyday science experiment explained'], ['technology', 'how everyday technology works'],
  ['culture', 'local traditions personal story'], ['history', 'museum object story explained'],
  ['psychology', 'memory habits everyday decisions'], ['school', 'how people learn practical demonstration'],
  ['work', 'an unusual job a day at work'], ['entertainment', 'behind the scenes creative performance'],
  ['sport', 'athlete explains training routine'], ['creativity', 'artist shows creative process'],
  ['design', 'designing an everyday object'], ['business', 'small business founder interview'],
  ['society', 'community project short documentary'], ['environment', 'practical conservation local story'],
  ['health', 'sleep exercise wellbeing explained'],
] as const;
const styles: Record<VidMatchLevel, string[]> = {
  A1: ['simple English clear visual demonstration', 'beginner English short everyday conversation'],
  A2: ['clear English step by step', 'short story easy English'],
  B1: ['clear narration English explainer', 'personal story English interview'],
  B2: ['English short documentary', 'English interview natural conversation'],
  C1: ['English discussion contrasting perspectives', 'English in depth interview'],
  C2: ['English nuanced debate interview', 'English discussion humor implicit meaning'],
};
/** Deterministic rotation over topic × format × learner band. Search intent never assigns a level. */
export function discoveryIntents(day: number, counts: Partial<Record<VidMatchLevel, number>>, limit = 4): SearchIntent[] {
  const levels = Object.keys(styles) as VidMatchLevel[];
  const rotation = ((Math.trunc(day) % levels.length) + levels.length) % levels.length;
  const ordered = levels.slice(rotation).concat(levels.slice(0, rotation)).sort((a,b) => (counts[a] ?? 0) - (counts[b] ?? 0));
  return ordered.slice(0, Math.max(1, Math.min(6, limit))).map((level, index) => {
    const topicIndex = Math.abs(Math.trunc(day) + index * 7) % subjects.length;
    const [topic, subject] = subjects[topicIndex];
    const style = styles[level][Math.abs(Math.floor(day / subjects.length)) % styles[level].length];
    return {level, topic, format: style.includes('interview') || style.includes('conversation') ? 'conversation' : 'explainer', query: `${subject} ${style}`};
  });
}
