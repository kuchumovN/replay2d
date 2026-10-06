import { SIDE_CT, SIDE_T, type RoundEndKind, type Side } from '@skybox/shared';

export interface RawRoundEvent {
  event_name: string;
  tick: number;
  is_warmup_period?: boolean;
  /** 2/3 in older demos, "T"/"CT" in newer ones. */
  winner?: number | string | null;
  /** RoundEndReason_t number in older demos, a name like "t_killed" in newer ones. */
  reason?: number | string | null;
}

export interface RoundBounds {
  number: number;
  startTick: number;
  freezeEndTick: number | null;
  endTick: number;
  officialEndTick: number;
  winner: Side | null;
  endKind: RoundEndKind;
}

const REASON_NAMES: Record<string, RoundEndKind> = {
  bomb_exploded: 'bomb_exploded',
  bomb_defused: 'bomb_defused',
  t_killed: 'elimination',
  ct_killed: 'elimination',
  time_ran_out: 'time',
  t_saved: 'time',
  target_saved: 'time',
  t_surrender: 'surrender',
  ct_surrender: 'surrender',
};

export function winnerSide(winner: RawRoundEvent['winner']): Side | null {
  if (winner === SIDE_T || winner === SIDE_CT) return winner;
  if (typeof winner !== 'string') return null;
  const w = winner.toUpperCase();
  return w === 'T' || w === 'TERRORIST' ? SIDE_T : w === 'CT' ? SIDE_CT : null;
}

/** CS round end reasons (RoundEndReason_t), numeric or by name. */
export function endKindFromReason(reason: RawRoundEvent['reason']): RoundEndKind {
  if (typeof reason === 'string') return REASON_NAMES[reason.toLowerCase()] ?? 'other';
  switch (reason) {
    case 1:
      return 'bomb_exploded';
    case 7:
      return 'bomb_defused';
    case 8:
    case 9:
      return 'elimination';
    case 12:
      return 'time';
    case 17:
    case 18:
      return 'surrender';
    default:
      return 'other';
  }
}

/**
 * Splits a match into rounds. Every counted round has exactly one `round_end`, so rounds are anchored
 * on it; start/freeze/official end are looked up around it. Everything before the last
 * `begin_new_match` (warmup, knife round, restarts) is dropped.
 */
export function sliceRounds(events: RawRoundEvent[], lastTick: number, tickrate: number): RoundBounds[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const matchStart = sorted.filter((e) => e.event_name === 'begin_new_match').at(-1)?.tick ?? 0;
  const relevant = sorted.filter((e) => e.tick >= matchStart);
  const of = (name: string) => relevant.filter((e) => e.event_name === name);

  const starts = [...of('round_start'), ...of('begin_new_match')].map((e) => e.tick).sort((a, b) => a - b);
  const freezeEnds = of('round_freeze_end').map((e) => e.tick);
  const officialEnds = of('round_officially_ended').map((e) => e.tick);
  const roundEnds = of('round_end').filter((e) => !e.is_warmup_period && winnerSide(e.winner) !== null);

  const rounds: RoundBounds[] = [];
  let prevEnd = matchStart - 1;
  for (let i = 0; i < roundEnds.length; i++) {
    const end = roundEnds[i];
    const nextEnd = roundEnds[i + 1]?.tick ?? Infinity;
    const prevOfficialEnd = rounds.at(-1)?.officialEndTick;

    const startCandidates = starts.filter((t) => t > prevEnd && t <= end.tick);
    if (prevOfficialEnd !== undefined && prevOfficialEnd <= end.tick) startCandidates.push(prevOfficialEnd);
    const startTick = startCandidates.length > 0 ? Math.max(...startCandidates) : Math.max(matchStart, prevEnd + 1);

    const freezeEndTick = freezeEnds.filter((t) => t > startTick && t <= end.tick).at(-1) ?? null;

    const officialEndTick =
      officialEnds.find((t) => t >= end.tick && t < nextEnd) ??
      starts.find((t) => t > end.tick && t <= nextEnd) ??
      Math.min(lastTick, end.tick + 7 * tickrate);

    rounds.push({
      number: rounds.length + 1,
      startTick,
      freezeEndTick,
      endTick: end.tick,
      officialEndTick: Math.max(officialEndTick, end.tick),
      winner: winnerSide(end.winner),
      endKind: endKindFromReason(end.reason),
    });
    prevEnd = end.tick;
  }
  return rounds;
}

/** Ticks of a round's uniform grid: startTick, startTick + step, ..., up to officialEndTick inclusive. */
export function gridTicks(startTick: number, endTick: number, step: number): number[] {
  const ticks: number[] = [];
  for (let t = startTick; t <= endTick; t += step) ticks.push(t);
  return ticks;
}
