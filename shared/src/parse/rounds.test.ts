import { describe, expect, it } from 'vitest';
import { endKindFromReason, gridTicks, sliceRounds, type RawRoundEvent } from './rounds.js';

const ev = (event_name: string, tick: number, extra: Partial<RawRoundEvent> = {}): RawRoundEvent => ({
  event_name,
  tick,
  ...extra,
});

describe('sliceRounds', () => {
  it('drops warmup and anchors rounds on round_end', () => {
    const events = [
      ev('round_start', 65, { is_warmup_period: true }),
      ev('round_end', 60, { is_warmup_period: true, winner: 3, reason: 8 }),
      ev('begin_new_match', 67),
      ev('round_freeze_end', 1761),
      ev('round_end', 8971, { winner: 2, reason: 9 }),
      ev('round_officially_ended', 9419),
      ev('round_start', 9419),
      ev('round_freeze_end', 10699),
      ev('round_end', 15232, { winner: 3, reason: 7 }),
      ev('round_officially_ended', 15680),
    ];
    expect(sliceRounds(events, 20000, 64)).toEqual([
      { number: 1, startTick: 67, freezeEndTick: 1761, endTick: 8971, officialEndTick: 9419, winner: 2, endKind: 'elimination' },
      { number: 2, startTick: 9419, freezeEndTick: 10699, endTick: 15232, officialEndTick: 15680, winner: 3, endKind: 'bomb_defused' },
    ]);
  });

  it('handles a surrender during freeze time at the end of the demo', () => {
    const events = [
      ev('begin_new_match', 0),
      ev('round_freeze_end', 100),
      ev('round_end', 500, { winner: 3, reason: 8 }),
      ev('round_officially_ended', 700),
      ev('round_start', 700),
      ev('round_end', 900, { winner: 2, reason: 18 }),
    ];
    const rounds = sliceRounds(events, 1000, 64);
    expect(rounds[1]).toMatchObject({ startTick: 700, freezeEndTick: null, endTick: 900, officialEndTick: 1000, endKind: 'surrender' });
  });

  it('falls back to the next round_start when round_officially_ended is missing', () => {
    const events = [
      ev('begin_new_match', 0),
      ev('round_end', 500, { winner: 3 }),
      ev('round_start', 800),
      ev('round_end', 1500, { winner: 2 }),
      ev('round_officially_ended', 1900),
    ];
    const rounds = sliceRounds(events, 5000, 64);
    expect(rounds.map((r) => [r.startTick, r.officialEndTick])).toEqual([
      [0, 800],
      [800, 1900],
    ]);
  });

  it('ignores everything before the last begin_new_match (restarts)', () => {
    const events = [
      ev('begin_new_match', 0),
      ev('round_end', 500, { winner: 3 }),
      ev('begin_new_match', 1000),
      ev('round_end', 2000, { winner: 2 }),
    ];
    const rounds = sliceRounds(events, 3000, 64);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ number: 1, startTick: 1000, endTick: 2000 });
  });

  it('skips round_end events without a winner', () => {
    const events = [ev('begin_new_match', 0), ev('round_end', 300, { winner: 1 }), ev('round_end', 500, { winner: 2 })];
    expect(sliceRounds(events, 1000, 64)).toHaveLength(1);
  });
});

describe('newer demo format', () => {
  it('accepts string winners and reasons, without begin_new_match', () => {
    const events = [
      ev('round_start', 1),
      ev('round_freeze_end', 1272),
      ev('round_end', 4628, { winner: 'CT', reason: 't_killed' }),
      ev('round_officially_ended', 4948),
      ev('round_start', 4948),
      ev('round_end', 5000, { winner: null, reason: null }),
      ev('round_end', 9000, { winner: 'T', reason: 'time_ran_out' }),
    ];
    expect(sliceRounds(events, 10000, 64)).toMatchObject([
      { number: 1, startTick: 1, freezeEndTick: 1272, endTick: 4628, winner: 3, endKind: 'elimination' },
      { number: 2, startTick: 4948, endTick: 9000, winner: 2, endKind: 'time' },
    ]);
  });
});

describe('endKindFromReason', () => {
  it('maps known reasons', () => {
    expect(endKindFromReason(1)).toBe('bomb_exploded');
    expect(endKindFromReason(12)).toBe('time');
    expect(endKindFromReason(17)).toBe('surrender');
    expect(endKindFromReason(undefined)).toBe('other');
    expect(endKindFromReason('bomb_defused')).toBe('bomb_defused');
    expect(endKindFromReason('ct_surrender')).toBe('surrender');
    expect(endKindFromReason('still_in_progress')).toBe('other');
  });
});

describe('gridTicks', () => {
  it('includes both ends when aligned', () => {
    expect(gridTicks(10, 16, 2)).toEqual([10, 12, 14, 16]);
    expect(gridTicks(10, 15, 2)).toEqual([10, 12, 14]);
  });
});
