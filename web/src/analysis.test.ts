import { analyze, holdPlaceOf, mergePlaces, routeOf, SIDE_CT, SIDE_T, type Life } from '@skybox/shared';
import { describe, expect, it } from 'vitest';

const life = (over: Partial<Life>): Life => ({
  round: 1,
  player: 'a',
  side: SIDE_T,
  won: false,
  path: [],
  end: 100,
  kills: [],
  death: null,
  firstContact: null,
  ...over,
});

const visits = (...pairs: [string, number][]) => pairs.map(([place, t]) => ({ place, t }));

describe('routeOf', () => {
  it('keeps callouts entered inside the window', () => {
    const l = life({ path: visits(['TSpawn', 0], ['Mid', 5], ['TopMid', 12], ['ASite', 40]) });
    expect(routeOf(l, 30, 1)).toEqual(['TSpawn', 'Mid', 'TopMid']);
  });

  it('drops border flickers and revisits but keeps the last place in the window', () => {
    const l = life({ path: visits(['TSpawn', 0], ['Mid', 5], ['Cat', 9.5], ['Mid', 9.8], ['Short', 20], ['ASite', 29.8]) });
    expect(routeOf(l, 30, 1)).toEqual(['TSpawn', 'Mid', 'Short', 'ASite']);
  });
});

describe('holdPlaceOf', () => {
  it('picks the longest stay before first contact, ignoring spawn', () => {
    const l = life({ side: SIDE_CT, path: visits(['CTSpawn', 0], ['Truck', 6], ['Mid', 20]), firstContact: 18, end: 60 });
    expect(holdPlaceOf(l)).toBe('Truck');
  });

  it('falls back to spawn when the player never left it', () => {
    const l = life({ side: SIDE_CT, path: visits(['CTSpawn', 0]), firstContact: 10 });
    expect(holdPlaceOf(l)).toBe('CTSpawn');
  });
});

describe('analyze', () => {
  const lives = [
    life({ player: 'a', path: visits(['TSpawn', 0], ['B', 5]), kills: visits(['B', 20], ['B', 21]), won: true }),
    life({ player: 'b', round: 2, path: visits(['TSpawn', 0], ['B', 5]), death: { place: 'B', t: 22 } }),
    life({ player: 'a', round: 3, path: visits(['TSpawn', 0], ['A', 5]), death: { place: 'A', t: 15 } }),
    life({ player: 'c', side: SIDE_CT, path: visits(['CTSpawn', 0], ['B', 8]) }),
  ];

  it('groups lives by route and ranks by (kills - deaths) per life', () => {
    const groups = analyze(lives, { side: SIDE_T, players: null, window: 30, minVisit: 1 });
    expect(groups.map((g) => g.places.join('>'))).toEqual(['TSpawn>B', 'TSpawn>A']);
    expect(groups[0]).toMatchObject({ lives: 2, kills: 2, deaths: 1, roundsWon: 1, score: 0.5 });
    expect(groups[0].players.sort()).toEqual(['a', 'b']);
  });

  it('filters by player and side', () => {
    const groups = analyze(lives, { side: SIDE_T, players: new Set(['b']), window: 30, minVisit: 1 });
    expect(groups).toHaveLength(1);
    expect(analyze(lives, { side: SIDE_CT, players: null, window: 30, minVisit: 1 })[0].places).toEqual(['B']);
  });
});

it('mergePlaces averages callout positions weighted by samples', () => {
  const merged = mergePlaces([{ places: { Mid: [0, 0, 0, 1] } }, { places: { Mid: [30, 60, 90, 2] } }]);
  expect(merged.get('Mid')).toEqual({ x: 20, y: 40, z: 60 });
});
