import type { MapInfo, MapLevel } from '../shared/src/types.js';

/** Map entry of cs2-map-icons' data/available.json. */
export interface SourceMap {
  display_name?: string;
  radar_paths?: string[];
  radar_info?: {
    pos_x: number;
    pos_y: number;
    scale: number;
    verticalsections?: Record<string, { AltitudeMax: number; AltitudeMin: number }>;
  };
}

/** Stand-in for an unbounded altitude range (JSON has no Infinity). */
const ALTITUDE_LIMIT = 100000;

/**
 * Picks the radar image for a vertical section: "<map>_radar_psd.png" for the default section and
 * "<map>_<section>_radar_psd.png" for the others, falling back to the _tga and unsuffixed exports.
 */
function findImage(map: string, section: string, paths: string[]): string | undefined {
  const base = section === 'default' ? `${map}_radar` : `${map}_${section}_radar`;
  const file = (p: string) => p.split('/').pop()!;
  for (const suffix of ['_psd', '_tga', '']) {
    const match = paths.find((p) => file(p) === `${base}${suffix}.png`);
    if (match) return match;
  }
  return undefined;
}

export function buildMapInfo(name: string, source: SourceMap): { info: MapInfo; downloads: { level: MapLevel; url: string }[] } | null {
  const radar = source.radar_info;
  const paths = source.radar_paths ?? [];
  if (!radar || !(radar.scale > 0) || paths.length === 0) return null;

  const sections = radar.verticalsections ?? { default: { AltitudeMax: ALTITUDE_LIMIT, AltitudeMin: -ALTITUDE_LIMIT } };
  const downloads: { level: MapLevel; url: string }[] = [];
  for (const [section, range] of Object.entries(sections)) {
    const url = findImage(name, section, paths);
    if (!url) continue;
    downloads.push({
      url,
      level: { name: section, image: `${name}/${section}.png`, altitudeMin: range.AltitudeMin, altitudeMax: range.AltitudeMax },
    });
  }
  if (!downloads.some((d) => d.level.name === 'default')) return null;
  downloads.sort((a, b) => b.level.altitudeMax - a.level.altitudeMax);

  return {
    info: {
      name,
      displayName: source.display_name ?? name,
      posX: radar.pos_x,
      posY: radar.pos_y,
      scale: radar.scale,
      levels: downloads.map((d) => d.level),
    },
    downloads,
  };
}
