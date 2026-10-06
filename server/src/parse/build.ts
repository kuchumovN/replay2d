import {
  SIDE_CT,
  SIDE_T,
  isNonFiring,
  weaponId,
  type BombEvent,
  type GameEvent,
  type GrenadeEffect,
  type GrenadeTrack,
  type GrenadeType,
  type MatchMeta,
  type PlayerFrames,
  type PlayerInfo,
  type PlayerSlow,
  type RoundData,
  type RoundMeta,
  type Side,
  type Vec3,
} from '@skybox/shared';
import type { RoundBounds } from './rounds.js';

export const FRAME_STEP = 2;
export const SLOW_STEP = 16;

/** Struct-of-arrays output of `parseTicks(..., structOfArrays = true)`. */
export type Columns = Record<string, any[]>;

export interface RawGrenadeRow {
  grenade_entity_id: number;
  grenade_type: string;
  steamid: string | null;
  name: string | null;
  tick: number;
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface RawInput {
  fileName: string;
  mapName: string;
  serverName: string;
  tickrate: number;
  c4Timer: number;
  maxRounds: number;
  overtimeMaxRounds: number;
  rounds: RoundBounds[];
  /** Fast props on every round's FRAME_STEP grid. */
  fast: Columns;
  /** Slow props on every round's SLOW_STEP grid. */
  slow: Columns;
  /** Slow props sampled shortly after each round_end (scores, names, round time). */
  roundState: Columns;
  events: any[];
  grenades: RawGrenadeRow[];
}

export interface BuiltMatch {
  meta: Omit<MatchMeta, 'id'>;
  rounds: RoundData[];
}

/** Bots share steamid "0", so they are keyed by name. */
export function playerKey(steamid: string | null | undefined, name: string | null | undefined): string | null {
  if (steamid && steamid !== '0') return steamid;
  if (name) return `BOT:${name}`;
  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

class StringTable {
  readonly list: string[] = [];
  private readonly index = new Map<string, number>();
  id(s: string): number {
    let i = this.index.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(s);
      this.index.set(s, i);
    }
    return i;
  }
}

/** Maps a tick to the rounds whose grid contains it (adjacent rounds share their boundary tick). */
function tickLookup(rounds: RoundBounds[], step: number) {
  return (tick: number) =>
    rounds.filter((r) => tick >= r.startTick && tick <= r.officialEndTick && (tick - r.startTick) % step === 0);
}

function isSide(v: unknown): v is Side {
  return v === SIDE_T || v === SIDE_CT;
}

function buildFrames(
  rounds: RoundBounds[],
  fast: Columns,
  strings: StringTable[],
): Map<number, PlayerFrames[]> {
  const out = new Map<number, Map<string, PlayerFrames>>();
  const counts = new Map(rounds.map((r) => [r.number, Math.floor((r.officialEndTick - r.startTick) / FRAME_STEP) + 1]));
  const lookup = tickLookup(rounds, FRAME_STEP);
  const n = fast.tick?.length ?? 0;

  for (let i = 0; i < n; i++) {
    const side = fast.team_num[i];
    if (!isSide(side)) continue;
    const key = playerKey(fast.steamid[i], fast.name[i]);
    if (!key) continue;
    for (const r of lookup(fast.tick[i])) {
      const fi = (fast.tick[i] - r.startTick) / FRAME_STEP;
      let players = out.get(r.number);
      if (!players) out.set(r.number, (players = new Map()));
      let p = players.get(key);
      if (!p) {
        const c = counts.get(r.number)!;
        p = {
          steamid: key,
          x: new Array(c).fill(null),
          y: new Array(c).fill(null),
          z: new Array(c).fill(null),
          yaw: new Array(c).fill(null),
          hp: new Array(c).fill(0),
          alive: new Array(c).fill(0),
          weapon: new Array(c).fill(0),
          side: new Array(c).fill(side),
        };
        players.set(key, p);
      }
      const x = fast.X[i];
      if (x != null) {
        p.x[fi] = Math.round(x);
        p.y[fi] = Math.round(fast.Y[i]);
        p.z[fi] = Math.round(fast.Z[i]);
        p.yaw[fi] = fast.yaw[i] == null ? null : round1(fast.yaw[i]);
      }
      p.hp[fi] = fast.health[i] ?? 0;
      p.alive[fi] = fast.is_alive[i] ? 1 : 0;
      p.weapon[fi] = strings[r.number].id(fast.active_weapon_name[i] ?? '');
      p.side[fi] = side;
    }
  }

  return new Map([...out].map(([num, players]) => [num, [...players.values()]]));
}

function buildSlow(rounds: RoundBounds[], slow: Columns, strings: StringTable[]): Map<number, PlayerSlow[]> {
  const out = new Map<number, Map<string, PlayerSlow & { seen: boolean[] }>>();
  const counts = new Map(rounds.map((r) => [r.number, Math.floor((r.officialEndTick - r.startTick) / SLOW_STEP) + 1]));
  const lookup = tickLookup(rounds, SLOW_STEP);
  const n = slow.tick?.length ?? 0;

  for (let i = 0; i < n; i++) {
    if (!isSide(slow.team_num[i])) continue;
    const key = playerKey(slow.steamid[i], slow.name[i]);
    if (!key) continue;
    for (const r of lookup(slow.tick[i])) {
      const si = (slow.tick[i] - r.startTick) / SLOW_STEP;
      let players = out.get(r.number);
      if (!players) out.set(r.number, (players = new Map()));
      let p = players.get(key);
      if (!p) {
        const c = counts.get(r.number)!;
        p = {
          steamid: key,
          armor: new Array(c).fill(0),
          helmet: new Array(c).fill(0),
          defuser: new Array(c).fill(0),
          money: new Array(c).fill(0),
          kills: new Array(c).fill(0),
          deaths: new Array(c).fill(0),
          assists: new Array(c).fill(0),
          inventory: Array.from({ length: c }, () => []),
          seen: new Array(c).fill(false),
        };
        players.set(key, p);
      }
      const table = strings[r.number];
      p.armor[si] = slow.armor_value[i] ?? 0;
      p.helmet[si] = slow.has_helmet[i] ? 1 : 0;
      p.defuser[si] = slow.has_defuser[i] ? 1 : 0;
      p.money[si] = slow.balance[i] ?? 0;
      p.kills[si] = slow.kills_total[i] ?? 0;
      p.deaths[si] = slow.deaths_total[i] ?? 0;
      p.assists[si] = slow.assists_total[i] ?? 0;
      p.inventory[si] = ((slow.inventory[i] as string[] | null) ?? []).map((s) => table.id(s));
      p.seen[si] = true;
    }
  }

  const result = new Map<number, PlayerSlow[]>();
  for (const [num, players] of out) {
    const list: PlayerSlow[] = [];
    for (const { seen, ...p } of players.values()) {
      // Carry the last known value over samples where the player had no row.
      for (let i = 1; i < seen.length; i++) {
        if (seen[i] || !seen[i - 1]) continue;
        p.armor[i] = p.armor[i - 1];
        p.helmet[i] = p.helmet[i - 1];
        p.defuser[i] = p.defuser[i - 1];
        p.money[i] = p.money[i - 1];
        p.kills[i] = p.kills[i - 1];
        p.deaths[i] = p.deaths[i - 1];
        p.assists[i] = p.assists[i - 1];
        p.inventory[i] = p.inventory[i - 1];
        seen[i] = true;
      }
      list.push(p);
    }
    result.set(num, list);
  }
  return result;
}

function pos(e: any, prefix: string): Vec3 | null {
  const x = e[`${prefix}X`];
  if (x == null) return null;
  return { x: Math.round(x), y: Math.round(e[`${prefix}Y`]), z: Math.round(e[`${prefix}Z`]) };
}

const BOMB_ACTIONS: Record<string, BombEvent['action']> = {
  bomb_pickup: 'pickup',
  bomb_dropped: 'drop',
  bomb_beginplant: 'beginplant',
  bomb_planted: 'planted',
  bomb_begindefuse: 'begindefuse',
  bomb_defused: 'defused',
  bomb_exploded: 'exploded',
};

export function convertEvent(e: any): GameEvent | null {
  const user = playerKey(e.user_steamid, e.user_name);
  switch (e.event_name) {
    case 'player_death':
      if (!user) return null;
      return {
        type: 'kill',
        tick: e.tick,
        attacker: playerKey(e.attacker_steamid, e.attacker_name),
        victim: user,
        assister: playerKey(e.assister_steamid, e.assister_name),
        assistedFlash: !!e.assistedflash,
        weapon: weaponId(e.weapon ?? ''),
        headshot: !!e.headshot,
        wallbang: (e.penetrated ?? 0) > 0,
        throughSmoke: !!e.thrusmoke,
        noScope: !!e.noscope,
        attackerBlind: !!e.attackerblind,
        victimPos: pos(e, 'user_') ?? { x: 0, y: 0, z: 0 },
      };
    case 'weapon_fire': {
      const weapon = weaponId(e.weapon ?? '');
      if (!user || isNonFiring(weapon)) return null;
      return { type: 'shot', tick: e.tick, player: user, weapon };
    }
    case 'item_pickup':
      if (!user || e.item !== 'c4') return null;
      return { type: 'bomb', tick: e.tick, action: 'pickup', player: user, pos: null };
    case 'player_blind':
      if (!user || !(e.blind_duration > 0)) return null;
      return { type: 'blind', tick: e.tick, player: user, duration: e.blind_duration };
    default: {
      const action = BOMB_ACTIONS[e.event_name];
      if (!action) return null;
      const ev: BombEvent = { type: 'bomb', tick: e.tick, action, player: user, pos: pos(e, 'user_') };
      if (action === 'begindefuse') ev.hasKit = !!e.haskit;
      return ev;
    }
  }
}

const GRENADE_TYPES: Record<string, GrenadeType> = {
  CSmokeGrenadeProjectile: 'smoke',
  CFlashbangProjectile: 'flash',
  CHEGrenadeProjectile: 'he',
  CMolotovProjectile: 'molotov',
  CDecoyProjectile: 'decoy',
};

const DETONATIONS = new Set(['smokegrenade_detonate', 'flashbang_detonate', 'hegrenade_detonate', 'decoy_started']);

/**
 * Turns per-tick projectile rows into flight paths. Entity ids are reused, so one id is split into
 * separate throws wherever its ticks are not contiguous. A flight ends at the matching detonation event
 * (smokes and HEs stay around as entities after detonating) or when the projectile disappears.
 */
export function buildGrenadeTracks(rows: RawGrenadeRow[], events: any[], step: number): GrenadeTrack[] {
  const byEntity = new Map<number, RawGrenadeRow[]>();
  for (const r of rows) {
    if (!GRENADE_TYPES[r.grenade_type] || r.x == null) continue;
    let list = byEntity.get(r.grenade_entity_id);
    if (!list) byEntity.set(r.grenade_entity_id, (list = []));
    list.push(r);
  }

  const detonations = new Map<number, number[]>();
  for (const e of events) {
    if (!DETONATIONS.has(e.event_name) || e.entityid == null) continue;
    let list = detonations.get(e.entityid);
    if (!list) detonations.set(e.entityid, (list = []));
    list.push(e.tick);
  }

  const tracks: GrenadeTrack[] = [];
  for (const [entity, list] of byEntity) {
    list.sort((a, b) => a.tick - b.tick);
    let seg: RawGrenadeRow[] = [];
    const flush = () => {
      if (seg.length < 2) return;
      const first = seg[0];
      const last = seg[seg.length - 1];
      const det = detonations.get(entity)?.find((t) => t >= first.tick && t <= last.tick + step);
      const endTick = det ?? last.tick;
      const points: number[] = [];
      const push = (r: RawGrenadeRow) => points.push(Math.round(r.x!), Math.round(r.y!), Math.round(r.z!));
      let lastPushed: RawGrenadeRow | null = null;
      for (const r of seg) {
        if (r.tick > endTick) break;
        if ((r.tick - first.tick) % step === 0) {
          push(r);
          lastPushed = r;
        }
      }
      const tail = [...seg].reverse().find((r) => r.tick <= endTick)!;
      if (tail !== lastPushed) push(tail);
      tracks.push({
        type: GRENADE_TYPES[first.grenade_type],
        thrower: playerKey(first.steamid, first.name),
        startTick: first.tick,
        endTick: tail.tick,
        points,
      });
    };
    for (const r of list) {
      if (seg.length > 0 && r.tick - seg[seg.length - 1].tick > step) {
        flush();
        seg = [];
      }
      seg.push(r);
    }
    flush();
  }
  return tracks.sort((a, b) => a.startTick - b.startTick);
}

/** Smoke clouds, fires and detonation flashes with their lifetimes. */
export function buildEffects(events: any[], tickrate: number): GrenadeEffect[] {
  const effects: GrenadeEffect[] = [];
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const findEnd = (name: string, start: any) =>
    sorted.find((e) => e.event_name === name && e.entityid === start.entityid && e.tick > start.tick)?.tick;
  for (const e of sorted) {
    const p: Vec3 = { x: Math.round(e.x ?? 0), y: Math.round(e.y ?? 0), z: Math.round(e.z ?? 0) };
    const thrower = playerKey(e.user_steamid, e.user_name);
    switch (e.event_name) {
      case 'smokegrenade_detonate':
        effects.push({ type: 'smoke', thrower, startTick: e.tick, endTick: findEnd('smokegrenade_expired', e) ?? e.tick + 20 * tickrate, pos: p });
        break;
      case 'inferno_startburn':
        effects.push({ type: 'molotov', thrower, startTick: e.tick, endTick: findEnd('inferno_expire', e) ?? e.tick + 7 * tickrate, pos: p });
        break;
      case 'flashbang_detonate':
        effects.push({ type: 'flash', thrower, startTick: e.tick, endTick: e.tick + Math.round(tickrate / 2), pos: p });
        break;
      case 'hegrenade_detonate':
        effects.push({ type: 'he', thrower, startTick: e.tick, endTick: e.tick + Math.round(tickrate / 2), pos: p });
        break;
    }
  }
  return effects;
}

/** Scores, team names and round time per round, read from samples taken right after round_end. */
function roundStates(rounds: RoundBounds[], cols: Columns) {
  const n = cols.tick?.length ?? 0;
  return rounds.map((r) => {
    const state = { ctScore: 0, tScore: 0, ctName: '', tName: '', roundTime: 115 };
    const target = Math.min(r.endTick + 32, r.officialEndTick);
    for (let i = 0; i < n; i++) {
      if (cols.tick[i] !== target) continue;
      const side = cols.team_num[i];
      const score = cols.team_rounds_total[i] ?? 0;
      const name = cols.team_clan_name[i] || '';
      if (side === SIDE_CT) {
        state.ctScore = score;
        state.ctName ||= name;
      } else if (side === SIDE_T) {
        state.tScore = score;
        state.tName ||= name;
      }
      const rt = cols['CCSGameRulesProxy.CCSGameRules.m_iRoundTime']?.[i];
      if (rt > 0) state.roundTime = rt;
    }
    return { ...state, ctName: state.ctName || 'Counter-Terrorists', tName: state.tName || 'Terrorists' };
  });
}

export function roundStateTicks(rounds: RoundBounds[]): number[] {
  return rounds.map((r) => Math.min(r.endTick + 32, r.officialEndTick));
}

export function buildMatch(raw: RawInput): BuiltMatch {
  const { rounds, tickrate } = raw;
  const strings: StringTable[] = [];
  for (const r of rounds) strings[r.number] = new StringTable();

  const frames = buildFrames(rounds, raw.fast, strings);
  const slow = buildSlow(rounds, raw.slow, strings);
  const states = roundStates(rounds, raw.roundState);
  const events = raw.events.map(convertEvent).filter((e): e is GameEvent => e !== null);
  const tracks = buildGrenadeTracks(raw.grenades, raw.events, FRAME_STEP);
  const effects = buildEffects(raw.events, tickrate);

  const players = new Map<string, PlayerInfo>();
  const n = raw.slow.tick?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const key = playerKey(raw.slow.steamid[i], raw.slow.name[i]);
    if (key && isSide(raw.slow.team_num[i])) players.set(key, { steamid: key, name: raw.slow.name[i] ?? key });
  }

  const inRound = (r: RoundBounds, tick: number) => tick >= r.startTick && tick <= r.officialEndTick;
  const roundData: RoundData[] = rounds.map((r) => ({
    number: r.number,
    startTick: r.startTick,
    endTick: r.officialEndTick,
    frameStep: FRAME_STEP,
    frameCount: Math.floor((r.officialEndTick - r.startTick) / FRAME_STEP) + 1,
    slowStep: SLOW_STEP,
    slowCount: Math.floor((r.officialEndTick - r.startTick) / SLOW_STEP) + 1,
    strings: strings[r.number].list,
    players: frames.get(r.number) ?? [],
    slow: slow.get(r.number) ?? [],
    events: events.filter((e) => inRound(r, e.tick)),
    grenades: tracks.filter((g) => inRound(r, g.startTick)),
    effects: effects
      .filter((e) => inRound(r, e.startTick))
      .map((e) => ({ ...e, endTick: Math.min(e.endTick, r.officialEndTick) })),
  }));

  const roundMeta: RoundMeta[] = rounds.map((r, i) => ({ ...r, ...states[i] }));

  return {
    meta: {
      fileName: raw.fileName,
      mapName: raw.mapName,
      serverName: raw.serverName,
      tickrate,
      c4Timer: raw.c4Timer,
      maxRounds: raw.maxRounds,
      overtimeMaxRounds: raw.overtimeMaxRounds,
      players: [...players.values()],
      rounds: roundMeta,
    },
    rounds: roundData,
  };
}
