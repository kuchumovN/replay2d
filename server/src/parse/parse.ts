import { buildMatch, FRAME_STEP, roundStateTicks, SLOW_STEP, type BuiltMatch, type Columns } from './build.js';
import { parser, TICKRATE } from './native.js';
import { gridTicks, sliceRounds } from './rounds.js';

const DEFAULT_C4_TIMER = 40;
const DEFAULT_MAX_ROUNDS = 24;
const DEFAULT_OVERTIME_MAX_ROUNDS = 6;

export const ROUND_EVENTS = ['round_start', 'begin_new_match', 'round_freeze_end', 'round_end', 'round_officially_ended'];
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

export function parseDemo(path: string, fileName: string, onStage: (stage: string) => void): BuiltMatch {
  onStage('Reading header');
  const header = parser.parseHeader(path);

  onStage('Reading rounds');
  const roundEvents = parser.parseEvents(path, ROUND_EVENTS, [], ['is_warmup_period']) as any[];
  const events = parser.parseEvents(path, GAME_EVENTS, ['X', 'Y', 'Z'], []) as any[];
  const cvars = parser.parseEvents(path, ['server_cvar'], [], []) as any[];
  const lastTick = [...roundEvents, ...events].reduce((max, e) => Math.max(max, e.tick), 0);
  const rounds = sliceRounds(roundEvents, lastTick, TICKRATE);
  if (rounds.length === 0) throw new DemoError('No completed rounds found in this demo.');

  const cvar = (name: string, fallback: number) => {
    const value = Number(cvars.filter((c) => c.name === name).at(-1)?.value);
    return value > 0 ? value : fallback;
  };

  onStage('Parsing player positions');
  const fastTicks = [...new Set(rounds.flatMap((r) => gridTicks(r.startTick, r.officialEndTick, FRAME_STEP)))];
  const fast = parser.parseTicks(path, FAST_PROPS, fastTicks, null, true) as Columns;

  onStage('Parsing player state');
  const slowTicks = [
    ...new Set([...rounds.flatMap((r) => gridTicks(r.startTick, r.officialEndTick, SLOW_STEP)), ...roundStateTicks(rounds)]),
  ];
  const slow = parser.parseTicks(path, SLOW_PROPS, slowTicks, null, true) as Columns;

  onStage('Parsing grenades');
  const grenades = parser.parseGrenades(path, null, false) as any[];

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
