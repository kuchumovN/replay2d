import { SIDE_T, type PlayerInfo, type Side } from './types.js';

/** Bump when the extract format changes; older extracts are ignored and must be re-added. */
export const EXTRACT_VERSION = 1;

/** A callout (CS2 nav place name) entered `t` seconds after freeze time ended. */
export interface PlaceVisit {
  place: string;
  t: number;
}

/** One player's round from freeze end until death or round end. */
export interface Life {
  round: number;
  player: string;
  side: Side;
  /** The player's side won the round. */
  won: boolean;
  /** Callouts in visiting order, consecutive duplicates collapsed. */
  path: PlaceVisit[];
  /** Seconds after freeze end when the life ended (death or round end). */
  end: number;
  /** Where the player stood when getting each kill. */
  kills: PlaceVisit[];
  death: PlaceVisit | null;
  /** First kill of the round by anyone. */
  firstContact: number | null;
}

/** Compact per-demo data kept on disk for route analysis. */
export interface DemoExtract {
  version: number;
  id: string;
  fileName: string;
  mapName: string;
  addedAt: string;
  rounds: number;
  players: PlayerInfo[];
  /** Mean world position of each callout: [x, y, z, samples]. */
  places: Record<string, [number, number, number, number]>;
  lives: Life[];
}

export type LibraryDemo = Omit<DemoExtract, 'places' | 'lives'>;

export type AnalysisJob =
  | { state: 'parsing'; stage: string }
  | { state: 'ready'; demo: LibraryDemo }
  | { state: 'error'; error: string };

export interface AnalysisOptions {
  side: Side;
  /** Steam ids to include; null = everyone. */
  players: ReadonlySet<string> | null;
  /** T routes: callouts entered within this many seconds after freeze end. */
  window: number;
  /** Shorter stays count as passing through (4 Hz sampling flickers on place borders). */
  minVisit: number;
}

export interface GroupStats {
  /** T: the route; CT: a single held callout. */
  places: string[];
  lives: number;
  kills: number;
  deaths: number;
  roundsWon: number;
  /** Distinct player ids. */
  players: string[];
  /** (kills - deaths) per life: how "profitable" the route/position is. */
  score: number;
}

export const DEFAULT_ANALYSIS: Omit<AnalysisOptions, 'side' | 'players'> = { window: 30, minVisit: 1 };

/** Visits with how long the player stayed, up to `limit` seconds after freeze end. */
function stays(life: Life, limit: number): { place: string; t: number; duration: number }[] {
  const out: { place: string; t: number; duration: number }[] = [];
  life.path.forEach((v, i) => {
    if (v.t >= limit) return;
    const until = Math.min(life.path[i + 1]?.t ?? life.end, limit);
    out.push({ place: v.place, t: v.t, duration: Math.max(0, until - v.t) });
  });
  return out;
}

/** Callouts a T passed through in the first `window` seconds (in first-visit order), ignoring brief border flickers. */
export function routeOf(life: Life, window: number, minVisit: number): string[] {
  const route: string[] = [];
  const all = stays(life, Infinity);
  all.forEach((s, i) => {
    if (s.t > window) return;
    // The last visit inside the window is kept even if short: it is where the player was heading.
    const isLast = i === all.length - 1 || all[i + 1].t > window;
    if (s.duration < minVisit && !isLast && i > 0) return;
    // Revisits (peeking out and back) are dropped so the same route is not split into variants.
    if (!route.includes(s.place)) route.push(s.place);
  });
  return route;
}

/** Callout a CT spent the most time in before the round's first contact (spawn only if nothing else). */
export function holdPlaceOf(life: Life): string | null {
  const limit = Math.min(life.end, life.firstContact ?? life.end);
  const time = new Map<string, number>();
  for (const s of stays(life, limit)) time.set(s.place, (time.get(s.place) ?? 0) + s.duration);
  const longest = (entries: [string, number][]) => entries.reduce<[string, number] | null>((a, e) => (!a || e[1] > a[1] ? e : a), null);
  const all = [...time].filter(([, t]) => t > 0);
  return (longest(all.filter(([p]) => !/spawn/i.test(p))) ?? longest(all))?.[0] ?? null;
}

export function analyze(lives: Life[], opts: AnalysisOptions): GroupStats[] {
  const groups = new Map<string, GroupStats & { ids: Set<string> }>();
  for (const life of lives) {
    if (life.side !== opts.side || (opts.players && !opts.players.has(life.player))) continue;
    const places = opts.side === SIDE_T ? routeOf(life, opts.window, opts.minVisit) : [holdPlaceOf(life)].filter((p) => p !== null);
    if (places.length === 0) continue;
    const key = places.join('>');
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { places, lives: 0, kills: 0, deaths: 0, roundsWon: 0, players: [], score: 0, ids: new Set() }));
    g.lives++;
    g.kills += life.kills.length;
    g.deaths += life.death ? 1 : 0;
    g.roundsWon += life.won ? 1 : 0;
    g.ids.add(life.player);
  }
  return [...groups.values()]
    .map(({ ids, ...g }) => ({ ...g, players: [...ids], score: (g.kills - g.deaths) / g.lives }))
    .sort((a, b) => b.score - a.score || b.lives - a.lives);
}

/** Sample-weighted mean callout positions across demos of one map. */
export function mergePlaces(extracts: Pick<DemoExtract, 'places'>[]): Map<string, { x: number; y: number; z: number }> {
  const sums = new Map<string, [number, number, number, number]>();
  for (const e of extracts) {
    for (const [place, [x, y, z, n]] of Object.entries(e.places)) {
      const s = sums.get(place) ?? [0, 0, 0, 0];
      sums.set(place, [s[0] + x * n, s[1] + y * n, s[2] + z * n, s[3] + n]);
    }
  }
  return new Map([...sums].map(([place, [x, y, z, n]]) => [place, { x: x / n, y: y / n, z: z / n }]));
}

export interface AppSettings {
  /** Shows the experimental route analysis screen. */
  analysisEnabled: boolean;
  ollamaUrl: string;
  /** Empty: the first installed model. */
  ollamaModel: string;
  summaryLanguage: 'en' | 'ru';
}

export const DEFAULT_SETTINGS: AppSettings = {
  analysisEnabled: false,
  ollamaUrl: 'http://127.0.0.1:11434',
  ollamaModel: '',
  summaryLanguage: 'en',
};

/** What the client sends for an LLM write-up: already computed numbers only. */
export interface SummaryRequest {
  map: string;
  side: 'T' | 'CT';
  players: string[];
  demos: number;
  window: number;
  groups: { places: string[]; lives: number; kills: number; deaths: number; roundsWon: number; score: number }[];
}
