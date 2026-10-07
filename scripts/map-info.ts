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

const SOURCE_RAW = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons';

/** Map and section names from the third-party index end up in file paths: only plain identifiers are accepted. */
const SAFE_NAME = /^[a-z0-9_]+$/i;

/** URL of a file in cs2-map-icons at a fixed commit. */
export function sourceUrl(commit: string, path: string): string {
  return `${SOURCE_RAW}/${commit}/${path}`;
}

/**
 * Picks the radar image for a vertical section: "<map>_radar_psd.png" for the default section and
 * "<map>_<section>_radar_psd.png" for the others, falling back to the _tga and unsuffixed exports.
 * Returns the file name; the URL is built from it, so the index cannot point downloads elsewhere.
 */
function findImage(map: string, section: string, paths: string[]): string | undefined {
  const base = section === 'default' ? `${map}_radar` : `${map}_${section}_radar`;
  const files = new Set(paths.map((p) => p.split('/').pop()));
  return ['_psd', '_tga', ''].map((suffix) => `${base}${suffix}.png`).find((file) => files.has(file));
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function buildMapInfo(
  name: string,
  source: SourceMap,
  commit: string,
): { info: MapInfo; downloads: { level: MapLevel; url: string }[] } | null {
  const radar = source.radar_info;
  const paths = source.radar_paths ?? [];
  if (!SAFE_NAME.test(name) || !radar || paths.length === 0) return null;
  if (!isNumber(radar.pos_x) || !isNumber(radar.pos_y) || !isNumber(radar.scale) || !(radar.scale > 0)) return null;

  const sections = radar.verticalsections ?? { default: { AltitudeMax: ALTITUDE_LIMIT, AltitudeMin: -ALTITUDE_LIMIT } };
  const downloads: { level: MapLevel; url: string }[] = [];
  for (const [section, range] of Object.entries(sections)) {
    if (!SAFE_NAME.test(section) || !isNumber(range?.AltitudeMin) || !isNumber(range?.AltitudeMax)) continue;
    const file = findImage(name, section, paths);
    if (!file) continue;
    const url = sourceUrl(commit, `images/radars/${file}`);
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
      displayName: typeof source.display_name === 'string' ? source.display_name : name,
      posX: radar.pos_x,
      posY: radar.pos_y,
      scale: radar.scale,
      levels: downloads.map((d) => d.level),
    },
    downloads,
  };
}
