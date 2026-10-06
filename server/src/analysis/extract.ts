import { EXTRACT_VERSION, SIDE_CT, SIDE_T, type DemoExtract, type Life, type Side } from '@skybox/shared';
import { playerKey, type Columns } from '../parse/build.js';
import { parser, TICKRATE } from '../parse/native.js';
import { DemoError, ROUND_EVENTS } from '../parse/parse.js';
import { gridTicks, sliceRounds, type RoundBounds } from '../parse/rounds.js';

/** 4 Hz is plenty for callout sequences and keeps the pass far lighter than the replay parse. */
export const PLACE_STEP = 16;
const PLACE_PROPS = ['last_place_name', 'X', 'Y', 'Z', 'team_num', 'is_alive'];

export interface RawDeath {
  tick: number;
  user_steamid?: string | null;
  user_name?: string | null;
  attacker_steamid?: string | null;
  attacker_name?: string | null;
  user_last_place_name?: string | null;
  attacker_last_place_name?: string | null;
}

export function extractDemo(path: string, fileName: string, id: string, onStage: (stage: string) => void): DemoExtract {
  onStage('Reading rounds');
  const header = parser.parseHeader(path);
  const roundEvents = parser.parseEvents(path, ROUND_EVENTS, [], ['is_warmup_period']) as any[];
  const deaths = parser.parseEvents(path, ['player_death'], ['last_place_name'], []) as RawDeath[];
  const lastTick = [...roundEvents, ...deaths].reduce((max, e) => Math.max(max, e.tick), 0);
  const rounds = sliceRounds(roundEvents, lastTick, TICKRATE).filter((r) => r.freezeEndTick !== null);
  if (rounds.length === 0) throw new DemoError('No completed rounds found in this demo.');

  onStage('Tracking callouts');
  const ticks = rounds.flatMap((r) => gridTicks(r.freezeEndTick!, r.endTick, PLACE_STEP));
  const samples = parser.parseTicks(path, PLACE_PROPS, ticks, null, true) as Columns;

  onStage('Building routes');
  return buildExtract({ id, fileName, mapName: header.map_name ?? 'unknown', rounds, samples, deaths });
}

interface ExtractInput {
  id: string;
  fileName: string;
  mapName: string;
  rounds: RoundBounds[];
  /** parseTicks struct-of-arrays: tick, steamid, name + PLACE_PROPS. */
  samples: Columns;
  deaths: RawDeath[];
}

const sec = (ticks: number) => Math.round((ticks / TICKRATE) * 10) / 10;

export function buildExtract({ id, fileName, mapName, rounds, samples, deaths }: ExtractInput): DemoExtract {
  const names = new Map<string, string>();
  const places: DemoExtract['places'] = {};
  const lives = new Map<string, Life>();
  const roundAt = (tick: number) => rounds.find((r) => tick >= r.freezeEndTick! && tick <= r.endTick);

  const order = samples.tick.map((_, i) => i).sort((a, b) => samples.tick[a] - samples.tick[b]);
  for (const i of order) {
    const player = playerKey(samples.steamid[i], samples.name[i]);
    const round = roundAt(samples.tick[i]);
    const team = samples.team_num[i];
    if (!player || !round || (team !== SIDE_T && team !== SIDE_CT)) continue;
    names.set(player, samples.name[i] ?? player);
    const key = `${round.number}:${player}`;
    let life = lives.get(key);
    if (!life) {
      lives.set(
        key,
        (life = {
          round: round.number,
          player,
          side: team as Side,
          won: round.winner === team,
          path: [],
          end: sec(round.endTick - round.freezeEndTick!),
          kills: [],
          death: null,
          firstContact: null,
        }),
      );
    }
    const place = samples.last_place_name[i];
    if (!samples.is_alive[i] || !place) continue;
    if (life.path.at(-1)?.place !== place) life.path.push({ place, t: sec(samples.tick[i] - round.freezeEndTick!) });
    const p = (places[place] ??= [0, 0, 0, 0]);
    const n = p[3] + 1;
    // Running mean keeps the stored numbers small.
    places[place] = [p[0] + (samples.X[i] - p[0]) / n, p[1] + (samples.Y[i] - p[1]) / n, p[2] + (samples.Z[i] - p[2]) / n, n];
  }

  for (const d of deaths) {
    const round = roundAt(d.tick);
    if (!round) continue;
    const t = sec(d.tick - round.freezeEndTick!);
    const victim = lives.get(`${round.number}:${playerKey(d.user_steamid, d.user_name)}`);
    const attacker = lives.get(`${round.number}:${playerKey(d.attacker_steamid, d.attacker_name)}`);
    if (victim) {
      victim.death = { place: d.user_last_place_name || victim.path.at(-1)?.place || '', t };
      victim.end = Math.min(victim.end, t);
    }
    // Team kills and suicides are not kills.
    if (attacker && attacker !== victim && attacker.side !== victim?.side) {
      attacker.kills.push({ place: d.attacker_last_place_name || attacker.path.at(-1)?.place || '', t });
    }
    for (const life of lives.values()) {
      if (life.round === round.number && (life.firstContact === null || t < life.firstContact)) life.firstContact = t;
    }
  }

  const round = (v: number) => Math.round(v);
  return {
    version: EXTRACT_VERSION,
    id,
    fileName,
    mapName,
    addedAt: new Date().toISOString(),
    rounds: rounds.length,
    players: [...names].map(([steamid, name]) => ({ steamid, name })),
    places: Object.fromEntries(Object.entries(places).map(([k, [x, y, z, n]]) => [k, [round(x), round(y), round(z), n]])),
    lives: [...lives.values()].filter((l) => l.path.length > 0),
  };
}

