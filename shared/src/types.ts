/** Team side as stored in the demo (`team_num`). */
export const SIDE_T = 2;
export const SIDE_CT = 3;
export type Side = typeof SIDE_T | typeof SIDE_CT;

export type RoundEndKind = 'bomb_exploded' | 'bomb_defused' | 'elimination' | 'time' | 'surrender' | 'other';

export interface PlayerInfo {
  steamid: string;
  name: string;
}

export interface RoundMeta {
  /** 1-based round number. */
  number: number;
  /** First tick of the round (round_start / begin_new_match). */
  startTick: number;
  /** Tick when freeze time ended, null if the round ended during freeze time. */
  freezeEndTick: number | null;
  /** Tick of round_end (winner decided). */
  endTick: number;
  /** Last tick of the round (round_officially_ended or next round start). */
  officialEndTick: number;
  winner: Side | null;
  endKind: RoundEndKind;
  /** Score after this round. */
  ctScore: number;
  tScore: number;
  ctName: string;
  tName: string;
  /** Round length in seconds (mp_roundtime). */
  roundTime: number;
}

export interface MatchMeta {
  id: string;
  fileName: string;
  mapName: string;
  serverName: string;
  tickrate: number;
  /** Seconds from plant to explosion. */
  c4Timer: number;
  /** mp_maxrounds and mp_overtime_maxrounds, used to mark side switches. */
  maxRounds: number;
  overtimeMaxRounds: number;
  players: PlayerInfo[];
  rounds: RoundMeta[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Per-player columns sampled on a uniform tick grid (see RoundData.frameStep). */
export interface PlayerFrames {
  steamid: string;
  /** null where the player has no data (disconnected). */
  x: (number | null)[];
  y: (number | null)[];
  z: (number | null)[];
  yaw: (number | null)[];
  hp: number[];
  alive: (0 | 1)[];
  /** Index into RoundData.strings. */
  weapon: number[];
  side: Side[];
}

/** Slowly changing per-player state sampled every RoundData.slowStep ticks. */
export interface PlayerSlow {
  steamid: string;
  armor: number[];
  helmet: (0 | 1)[];
  defuser: (0 | 1)[];
  money: number[];
  kills: number[];
  deaths: number[];
  assists: number[];
  /** Each entry is a list of indices into RoundData.strings. */
  inventory: number[][];
}

export type GrenadeType = 'smoke' | 'flash' | 'he' | 'molotov' | 'decoy';

export interface GrenadeTrack {
  type: GrenadeType;
  thrower: string | null;
  startTick: number;
  /** Tick when the projectile stopped flying (detonated or disappeared). */
  endTick: number;
  /** Flat [x, y, z, x, y, z, ...] sampled every RoundData.frameStep ticks from startTick. */
  points: number[];
}

export interface GrenadeEffect {
  type: 'smoke' | 'molotov' | 'flash' | 'he';
  thrower: string | null;
  startTick: number;
  endTick: number;
  pos: Vec3;
}

export interface KillEvent {
  type: 'kill';
  tick: number;
  attacker: string | null;
  victim: string;
  assister: string | null;
  assistedFlash: boolean;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noScope: boolean;
  attackerBlind: boolean;
  victimPos: Vec3;
}

export interface ShotEvent {
  type: 'shot';
  tick: number;
  player: string;
  weapon: string;
}

export interface BlindEvent {
  type: 'blind';
  tick: number;
  player: string;
  duration: number;
}

export interface BombEvent {
  type: 'bomb';
  tick: number;
  action: 'pickup' | 'drop' | 'beginplant' | 'planted' | 'begindefuse' | 'defused' | 'exploded';
  player: string | null;
  pos: Vec3 | null;
  hasKit?: boolean;
}

export type GameEvent = KillEvent | ShotEvent | BlindEvent | BombEvent;

export interface RoundData {
  number: number;
  startTick: number;
  endTick: number;
  /** Frame i is at tick startTick + i * frameStep. */
  frameStep: number;
  frameCount: number;
  /** Slow sample i is at tick startTick + i * slowStep. */
  slowStep: number;
  slowCount: number;
  strings: string[];
  players: PlayerFrames[];
  slow: PlayerSlow[];
  events: GameEvent[];
  grenades: GrenadeTrack[];
  effects: GrenadeEffect[];
}

export interface MapLevel {
  /** Section name from the overview file: "default", "lower", ... */
  name: string;
  image: string;
  altitudeMin: number;
  altitudeMax: number;
}

export interface MapInfo {
  name: string;
  displayName: string;
  posX: number;
  posY: number;
  scale: number;
  /** Sorted top to bottom; the first one is the main radar. */
  levels: MapLevel[];
}

export type ParseStatus =
  | { state: 'parsing'; stage: string }
  | { state: 'ready'; meta: MatchMeta }
  | { state: 'error'; error: string };
