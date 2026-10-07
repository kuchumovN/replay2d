import { buildMatch, FRAME_STEP, roundStateTicks, SLOW_STEP, type BuiltMatch, type Columns } from './build.js';
import { gridTicks, sliceRounds } from './rounds.js';

/**
 * The demoparser2 calls the pipeline needs, bound to one demo. Implemented by the native Node module (desktop)
 * and by the wasm build (browser); both return the same shapes.
 */
export interface DemoParser {
  parseHeader(): Record<string, string>;
  parseEvents(eventNames: string[], playerProps: string[], otherProps: string[]): any[];
  /** Struct-of-arrays output, like `parseTicks(..., structOfArrays = true)`. */
  parseTicks(props: string[], ticks: number[]): Columns;
  /** Projectiles only (`parseGrenades(demo, null, false)`). */
  parseGrenades(): any[];
}

/** CS2 demos are recorded at 64 ticks per second regardless of server subtick settings. */
const TICKRATE = 64;
const DEFAULT_C4_TIMER = 40;
const DEFAULT_MAX_ROUNDS = 24;
const DEFAULT_OVERTIME_MAX_ROUNDS = 6;

const ROUND_EVENTS = ['round_start', 'begin_new_match', 'round_freeze_end', 'round_end', 'round_officially_ended'];
const GAME_EVENTS = [
  'player_death',
  'weapon_fire',
  'player_blind',
  'bomb_pickup',
  // bomb_pickup is not fired for every pickup (e.g. a bomb dropped during freeze time); item_pickup is.
  'item_pickup',
  'bomb_dropped',
  'bomb_beginplant',
  'bomb_planted',
  'bomb_begindefuse',
  'bomb_defused',
  'bomb_exploded',
  'smokegrenade_detonate',
  'smokegrenade_expired',
  'inferno_startburn',
  'inferno_expire',
  'flashbang_detonate',
  'hegrenade_detonate',
  'decoy_started',
];
const FAST_PROPS = ['X', 'Y', 'Z', 'yaw', 'health', 'is_alive', 'active_weapon_name', 'team_num'];
const SLOW_PROPS = [
  'team_num',
  'armor_value',
  'has_helmet',
  'has_defuser',
  'balance',
  'kills_total',
  'deaths_total',
  'assists_total',
  'inventory',
  'team_rounds_total',
  'team_clan_name',
  'CCSGameRulesProxy.CCSGameRules.m_iRoundTime',
];

export class DemoError extends Error {}

/** CS2 (Source 2) demos start with "PBDEMS2\0"; CS:GO demos start with "HL2DEMO\0". Returns a problem or null. */
export function checkDemoMagic(head: Uint8Array): string | null {
  const magic = String.fromCharCode(...head.subarray(0, 8));
  if (magic === 'PBDEMS2\0') return null;
  if (magic === 'HL2DEMO\0') return 'This is a CS:GO demo. Only CS2 demos are supported.';
  return 'Not a CS2 demo file.';
}

export function parseDemo(parser: DemoParser, fileName: string, onStage: (stage: string) => void): BuiltMatch {
  onStage('Reading header');
  const header = parser.parseHeader();

  onStage('Reading rounds');
  // One pass over the demo for all events (each parse call reads the whole file).
  const allEvents = parser.parseEvents([...ROUND_EVENTS, ...GAME_EVENTS, 'server_cvar'], ['X', 'Y', 'Z'], ['is_warmup_period']);
  const roundEventNames = new Set(ROUND_EVENTS);
  const roundEvents = allEvents.filter((e) => roundEventNames.has(e.event_name));
  const events = allEvents.filter((e) => !roundEventNames.has(e.event_name) && e.event_name !== 'server_cvar');
  const cvars = allEvents.filter((e) => e.event_name === 'server_cvar');
  const lastTick = [...roundEvents, ...events].reduce((max, e) => Math.max(max, e.tick), 0);
  const rounds = sliceRounds(roundEvents, lastTick, TICKRATE);
  if (rounds.length === 0) throw new DemoError('No completed rounds found in this demo.');

  const cvar = (name: string, fallback: number) => {
    const value = Number(cvars.filter((c) => c.name === name).at(-1)?.value);
    return value > 0 ? value : fallback;
  };

  onStage('Parsing player positions');
  const fastTicks = [...new Set(rounds.flatMap((r) => gridTicks(r.startTick, r.officialEndTick, FRAME_STEP)))];
  const fast = parser.parseTicks(FAST_PROPS, fastTicks);

  onStage('Parsing player state');
  const slowTicks = [
    ...new Set([...rounds.flatMap((r) => gridTicks(r.startTick, r.officialEndTick, SLOW_STEP)), ...roundStateTicks(rounds)]),
  ];
  const slow = parser.parseTicks(SLOW_PROPS, slowTicks);

  onStage('Parsing grenades');
  const grenades = parser.parseGrenades();

  onStage('Building timeline');
  return buildMatch({
    fileName,
    mapName: header.map_name ?? 'unknown',
    serverName: header.server_name ?? '',
    tickrate: TICKRATE,
    c4Timer: cvar('mp_c4timer', DEFAULT_C4_TIMER),
    maxRounds: cvar('mp_maxrounds', DEFAULT_MAX_ROUNDS),
    overtimeMaxRounds: cvar('mp_overtime_maxrounds', DEFAULT_OVERTIME_MAX_ROUNDS),
    rounds,
    fast,
    slow,
    roundState: slow,
    events,
    grenades,
  });
}
