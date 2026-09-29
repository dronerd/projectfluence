import { LEVELS, type VidMatchVideo } from "./videoContract.ts";
import { normalizeTopics } from "./videoTaxonomy.ts";

/** Similarity uses ProjectFluence's learning annotations, never provider statistics or tags. */
export function learningRelevance(video: VidMatchVideo, source?: VidMatchVideo): number {
  if (!source) return 0;
  const distance = Math.abs(LEVELS.indexOf(video.level) - LEVELS.indexOf(source.level));
  const overlap = (left: string[], right: string[]) => left.filter((value) => right.includes(value)).length;
  return (distance === 0 ? 100 : distance === 1 ? 30 : -1000) + overlap(normalizeTopics(video.topics), normalizeTopics(source.topics)) * 15 + overlap(video.skills, source.skills) * 5;
}

/** Stable round-robin within a bounded window: each channel gets a turn before a repeat. */
export function diversifyVideos(videos: readonly VidMatchVideo[], source?: VidMatchVideo): VidMatchVideo[] {
  const sorted = [...videos].sort((a, b) => learningRelevance(b, source) - learningRelevance(a, source) || a.video_id.localeCompare(b.video_id, "en"));
  const channels = new Map<string, VidMatchVideo[]>();
  for (const video of sorted) {
    const key = video.channel_id || video.channel_name.trim().toLowerCase();
    const group = channels.get(key) ?? [];
    group.push(video);
    channels.set(key, group);
  }
  const result: VidMatchVideo[] = [];
  while (result.length < sorted.length) {
    for (const group of channels.values()) {
      const next = group.shift();
      if (next) result.push(next);
    }
  }
  return result;
}
