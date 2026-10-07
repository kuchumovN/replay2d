import { describe, expect, it } from 'vitest';
import { buildEffects, buildGrenadeTracks, buildMatch, convertEvent, playerKey, type RawGrenadeRow, type RawInput } from './build.js';
import type { RoundBounds } from './rounds.js';

const round = (number: number, startTick: number, officialEndTick: number): RoundBounds => ({
  number,
  startTick,
  freezeEndTick: startTick + 4,
  endTick: officialEndTick - 4,
  officialEndTick,
  winner: 3,
  endKind: 'elimination',
});

function columns(rows: Record<string, unknown>[]) {
  const cols: Record<string, unknown[]> = {};
  for (const row of rows) for (const [k, v] of Object.entries(row)) (cols[k] ??= []).push(v);
  return cols;
}

describe('playerKey', () => {
  it('keys bots by name', () => {
    expect(playerKey('76561198000000000', 'a')).toBe('76561198000000000');
    expect(playerKey('0', 'Bot Ivan')).toBe('BOT:Bot Ivan');
    expect(playerKey(null, null)).toBeNull();
  });
});

describe('convertEvent', () => {
  it('converts kills', () => {
    const kill = convertEvent({
      event_name: 'player_death',
      tick: 10,
      user_steamid: '2',
      user_name: 'v',
      user_X: 1.4,
      user_Y: 2.6,
      user_Z: 3,
      attacker_steamid: '1',
      attacker_name: 'a',
      assister_steamid: null,
      weapon: 'ak47',
      headshot: true,
      penetrated: 1,
    });
    expect(kill).toMatchObject({ type: 'kill', attacker: '1', victim: '2', assister: null, weapon: 'ak47', headshot: true, wallbang: true, victimPos: { x: 1, y: 3, z: 3 } });
  });

  it('drops shots from knives and grenades', () => {
    expect(convertEvent({ event_name: 'weapon_fire', tick: 1, user_steamid: '1', weapon: 'weapon_knife_t' })).toBeNull();
    expect(convertEvent({ event_name: 'weapon_fire', tick: 1, user_steamid: '1', weapon: 'weapon_hegrenade' })).toBeNull();
    expect(convertEvent({ event_name: 'weapon_fire', tick: 1, user_steamid: '1', weapon: 'weapon_ak47' })).toEqual({ type: 'shot', tick: 1, player: '1', weapon: 'ak47' });
  });

  it('treats a C4 item_pickup as a bomb pickup', () => {
    expect(convertEvent({ event_name: 'item_pickup', tick: 7, user_steamid: '1', item: 'c4' })).toEqual({ type: 'bomb', tick: 7, action: 'pickup', player: '1', pos: null });
    expect(convertEvent({ event_name: 'item_pickup', tick: 7, user_steamid: '1', item: 'ak47' })).toBeNull();
  });

  it('converts bomb events', () => {
    expect(convertEvent({ event_name: 'bomb_begindefuse', tick: 5, user_steamid: '1', haskit: true })).toMatchObject({ type: 'bomb', action: 'begindefuse', hasKit: true, pos: null });
  });
});

describe('buildGrenadeTracks', () => {
  const row = (entity: number, tick: number, x: number, type = 'CSmokeGrenadeProjectile'): RawGrenadeRow => ({
    grenade_entity_id: entity,
    grenade_type: type,
    steamid: '1',
    name: 'a',
    tick,
    x,
    y: 0,
    z: 0,
  });

  it('splits reused entity ids and cuts flights at detonation', () => {
    const rows = [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((t) => row(5, 100 + t, t * 10)),
      ...[0, 1, 2, 3].map((t) => row(5, 500 + t, t, 'CHEGrenadeProjectile')),
    ];
    const tracks = buildGrenadeTracks(rows, [{ event_name: 'smokegrenade_detonate', entityid: 5, tick: 105 }], 2);
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({ type: 'smoke', startTick: 100, endTick: 105 });
    // Points every 2 ticks plus the final point at the detonation tick.
    expect(tracks[0].points.filter((_, i) => i % 3 === 0)).toEqual([0, 20, 40, 50]);
    expect(tracks[1]).toMatchObject({ type: 'he', startTick: 500, endTick: 503 });
  });

  it('ignores non-projectile rows', () => {
    expect(buildGrenadeTracks([row(1, 1, 0, 'CSmokeGrenade'), row(1, 2, 0, 'CSmokeGrenade')], [], 2)).toEqual([]);
  });
});

describe('buildEffects', () => {
  it('pairs smoke detonations with their expiry', () => {
    const effects = buildEffects(
      [
        { event_name: 'smokegrenade_detonate', entityid: 7, tick: 100, x: 1, y: 2, z: 3 },
        { event_name: 'smokegrenade_expired', entityid: 7, tick: 1200 },
        { event_name: 'inferno_startburn', entityid: 9, tick: 300, x: 0, y: 0, z: 0 },
      ],
      64,
    );
    expect(effects).toEqual([
      { type: 'smoke', thrower: null, startTick: 100, endTick: 1200, pos: { x: 1, y: 2, z: 3 } },
      { type: 'molotov', thrower: null, startTick: 300, endTick: 300 + 7 * 64, pos: { x: 0, y: 0, z: 0 } },
    ]);
  });
});

describe('buildMatch', () => {
  const rounds = [round(1, 0, 8), round(2, 8, 16)];
  const fastRow = (tick: number, steamid: string, team: number, x: number) => ({
    tick,
    steamid,
    name: `p${steamid}`,
    team_num: team,
    X: x,
    Y: 0,
    Z: 0,
    yaw: 90.04,
    health: 100,
    is_alive: true,
    active_weapon_name: 'AK-47',
  });
  const slowRow = (tick: number, steamid: string, team: number, extra: Record<string, unknown> = {}) => ({
    tick,
    steamid,
    name: `p${steamid}`,
    team_num: team,
    armor_value: 100,
    has_helmet: true,
    has_defuser: false,
    balance: 800,
    kills_total: 0,
    deaths_total: 0,
    assists_total: 0,
    inventory: ['knife', 'Glock-18'],
    team_rounds_total: 0,
    team_clan_name: '',
    'CCSGameRulesProxy.CCSGameRules.m_iRoundTime': 115,
    ...extra,
  });

  const input: RawInput = {
    fileName: 'x.dem',
    mapName: 'de_mirage',
    serverName: '',
    tickrate: 64,
    c4Timer: 40,
    maxRounds: 24,
    overtimeMaxRounds: 6,
    rounds,
    fast: columns([
      fastRow(0, 'a', 2, 10),
      fastRow(2, 'a', 2, 12),
      fastRow(8, 'a', 2, 20),
      fastRow(10, 'a', 3, 22), // side swap after the half
      fastRow(0, 's', 1, 0), // spectator is ignored
    ]),
    slow: columns([slowRow(0, 'a', 2), slowRow(8, 'a', 2, { team_rounds_total: 1, team_clan_name: 'Navi' }), slowRow(16, 'a', 3)]),
    roundState: columns([
      slowRow(8, 'a', 2, { team_rounds_total: 1, team_clan_name: 'Navi' }),
      slowRow(8, 'b', 3, { team_rounds_total: 0 }),
    ]),
    events: [{ event_name: 'weapon_fire', tick: 9, user_steamid: 'a', weapon: 'weapon_ak47' }],
    grenades: [],
  };

  it('builds per-round frames on a uniform grid', () => {
    const { rounds: data } = buildMatch(input);
    expect(data[0].frameCount).toBe(5);
    const a = data[0].players.find((p) => p.steamid === 'a')!;
    expect(a.x).toEqual([10, 12, null, null, 20]);
    expect(a.yaw[0]).toBe(90);
    expect(data[0].strings[a.weapon[0]]).toBe('AK-47');
    expect(data[0].players.some((p) => p.steamid === 's')).toBe(false);
    // The boundary tick belongs to both rounds.
    const a2 = data[1].players.find((p) => p.steamid === 'a')!;
    expect(a2.x.slice(0, 2)).toEqual([20, 22]);
    expect(a2.side.slice(0, 2)).toEqual([2, 3]);
  });

  it('assigns events to rounds and reads scores after round end', () => {
    const { meta, rounds: data } = buildMatch(input);
    expect(data[1].events).toHaveLength(1);
    expect(data[0].events).toHaveLength(0);
    expect(meta.rounds[0]).toMatchObject({ tScore: 1, ctScore: 0, tName: 'Navi', ctName: 'Counter-Terrorists', roundTime: 115 });
    expect(meta.players).toEqual([{ steamid: 'a', name: 'pa' }]);
  });
});
