import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDemo } from './parse.js';

/**
 * Runs the whole pipeline on a real demo. Uses SKYBOX_TEST_DEMO or fixtures/test_demo.dem (the public
 * test demo from the demoparser repo: de_mirage, 10 rounds, T win 8:2 by surrender). Skipped if missing.
 */
const demo = process.env.SKYBOX_TEST_DEMO ?? fileURLToPath(new URL('../../../fixtures/test_demo.dem', import.meta.url));
const isDefaultFixture = !process.env.SKYBOX_TEST_DEMO;

describe.skipIf(!existsSync(demo))('parseDemo (real demo)', () => {
  const match = parseDemo(demo, 'test.dem', () => {});

  it('produces rounds with ten players and consistent frames', () => {
    expect(match.rounds.length).toBeGreaterThan(0);
    expect(match.meta.rounds).toHaveLength(match.rounds.length);
    for (const round of match.rounds) {
      expect(round.players.length).toBeGreaterThan(0);
      expect(round.players.length).toBeLessThanOrEqual(10);
      for (const p of round.players) expect(p.x).toHaveLength(round.frameCount);
    }
    expect(match.rounds[0].players).toHaveLength(10);
  });

  it.runIf(isDefaultFixture)('matches the known result of the fixture', () => {
    expect(match.meta.mapName).toBe('de_mirage');
    expect(match.meta.rounds).toHaveLength(10);
    const last = match.meta.rounds.at(-1)!;
    expect([last.tScore, last.ctScore]).toEqual([8, 2]);
    expect(last.endKind).toBe('surrender');
    expect(match.meta.rounds[1].endKind).toBe('bomb_defused');
    const kills = match.rounds.flatMap((r) => r.events.filter((e) => e.type === 'kill'));
    expect(kills.length).toBeGreaterThan(50);
  });
});
