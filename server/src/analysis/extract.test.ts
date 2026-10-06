import { SIDE_CT, SIDE_T } from '@skybox/shared';
import { describe, expect, it } from 'vitest';
import type { RoundBounds } from '../parse/rounds.js';
import { buildExtract, type RawDeath } from './extract.js';

const round: RoundBounds = { number: 1, startTick: 0, freezeEndTick: 640, endTick: 640 + 64 * 30, officialEndTick: 640 + 64 * 35, winner: SIDE_T, endKind: 'elimination' };

/** Two players sampled every second: a T walking TSpawn → Mid → ASite, a CT sitting on ASite. */
function samples() {
  const cols: Record<string, any[]> = { tick: [], steamid: [], name: [], last_place_name: [], X: [], Y: [], Z: [], team_num: [], is_alive: [] };
  const push = (tick: number, steamid: string, name: string, place: string, x: number, team: number, alive: boolean) => {
    cols.tick.push(tick);
    cols.steamid.push(steamid);
    cols.name.push(name);
    cols.last_place_name.push(place);
    cols.X.push(x);
    cols.Y.push(0);
    cols.Z.push(0);
    cols.team_num.push(team);
    cols.is_alive.push(alive);
  };
  for (let s = 0; s <= 30; s++) {
    const tick = 640 + s * 64;
    push(tick, 't1', 'Terro', s < 5 ? 'TSpawn' : s < 15 ? 'Mid' : 'ASite', s * 10, SIDE_T, true);
    push(tick, 'ct1', 'Counter', s < 3 ? 'CTSpawn' : 'ASite', 1000, SIDE_CT, s < 20);
  }
  return cols;
}

const deaths: RawDeath[] = [
  { tick: 640 + 20 * 64, user_steamid: 'ct1', user_name: 'Counter', attacker_steamid: 't1', attacker_name: 'Terro', user_last_place_name: 'ASite', attacker_last_place_name: 'ASite' },
];

describe('buildExtract', () => {
  const e = buildExtract({ id: 'x', fileName: 'd.dem', mapName: 'de_test', rounds: [round], samples: samples(), deaths });

  it('builds callout paths per life with times since freeze end', () => {
    const t = e.lives.find((l) => l.player === 't1')!;
    expect(t.path).toEqual([
      { place: 'TSpawn', t: 0 },
      { place: 'Mid', t: 5 },
      { place: 'ASite', t: 15 },
    ]);
    expect(t).toMatchObject({ side: SIDE_T, won: true, kills: [{ place: 'ASite', t: 20 }], death: null, firstContact: 20, end: 30 });
  });

  it('ends a life at death', () => {
    const ct = e.lives.find((l) => l.player === 'ct1')!;
    expect(ct).toMatchObject({ side: SIDE_CT, won: false, death: { place: 'ASite', t: 20 }, end: 20 });
  });

  it('averages callout positions from alive samples', () => {
    expect(e.places.TSpawn).toEqual([20, 0, 0, 5]);
    expect(e.players).toEqual([
      { steamid: 't1', name: 'Terro' },
      { steamid: 'ct1', name: 'Counter' },
    ]);
  });
});
