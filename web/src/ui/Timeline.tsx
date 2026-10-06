import { SIDE_CT, type MatchMeta, type RoundEndKind, type RoundMeta } from '@skybox/shared';
import { useRef } from 'react';
import { samplePlayer } from '../playback/interp';
import { SPEEDS, type Playback, type PlaybackSnapshot } from '../playback/playback';
import { formatClock, roundClock } from '../playback/state';

const END_ICONS: Record<RoundEndKind, { icon: string; label: string }> = {
  elimination: { icon: '☠', label: 'Elimination' },
  bomb_exploded: { icon: '✸', label: 'Bomb exploded' },
  bomb_defused: { icon: '✂', label: 'Bomb defused' },
  time: { icon: '⏱', label: 'Time ran out' },
  surrender: { icon: '⚑', label: 'Surrender' },
  other: { icon: '•', label: 'Round end' },
};

/** Sides switch after regulation halftime and after every overtime half. */
function isSideSwitchAfter(round: number, meta: MatchMeta) {
  const half = meta.maxRounds / 2;
  if (round === half) return true;
  const otHalf = meta.overtimeMaxRounds / 2;
  return round > half && round >= meta.maxRounds && otHalf > 0 && (round - meta.maxRounds) % otHalf === 0;
}

function winnerClass(r: RoundMeta) {
  return r.winner === SIDE_CT ? 'ct' : r.winner ? 't' : '';
}

interface Props {
  playback: Playback;
  snap: PlaybackSnapshot;
  meta: MatchMeta;
}

export function Timeline({ playback, snap, meta }: Props) {
  const roundMeta = meta.rounds[snap.roundIndex];
  const clock = snap.round ? roundClock(roundMeta, snap.round, snap.tick, meta.tickrate, meta.c4Timer) : null;
  const winner = roundMeta.winner === SIDE_CT ? roundMeta.ctName : roundMeta.tName;

  return (
    <footer className="timeline">
      <div className="rounds">
        {meta.rounds.map((r, i) => (
          <div key={r.number} className="round-cell">
            <button
              className={`round-btn ${winnerClass(r)}${i === snap.roundIndex ? ' current' : ''}`}
              onClick={() => playback.goToRound(i)}
              title={`Round ${r.number}: ${r.winner === SIDE_CT ? 'CT' : 'T'} win — ${END_ICONS[r.endKind].label} (${r.ctScore}:${r.tScore})`}
            >
              <span className="round-num">{r.number}</span>
              <span className="round-icon">{END_ICONS[r.endKind].icon}</span>
            </button>
            {isSideSwitchAfter(r.number, meta) && i < meta.rounds.length - 1 && <div className="half-sep" title="Side switch" />}
          </div>
        ))}
      </div>
      <div className="controls">
        <button onClick={() => playback.goToRound(snap.roundIndex - 1)} disabled={snap.roundIndex === 0} title="Previous round (↑)">
          ⏮
        </button>
        <button className="play" onClick={() => playback.togglePlay()} title="Play / pause (Space)">
          {snap.playing ? '❚❚' : '▶'}
        </button>
        <button
          onClick={() => playback.goToRound(snap.roundIndex + 1)}
          disabled={snap.roundIndex === meta.rounds.length - 1}
          title="Next round (↓)"
        >
          ⏭
        </button>
        <select value={snap.speed} onChange={(e) => playback.setSpeed(Number(e.target.value))} title="Playback speed (+ / −)">
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        <div className="round-label">
          Round {roundMeta.number}
          <span className="muted"> / {meta.rounds.length}</span>
        </div>
        {clock && (
          <div className={`clock ${clock.kind}`}>
            {clock.kind === 'over' ? (
              <span className={winnerClass(roundMeta)}>
                {winner} win · {END_ICONS[roundMeta.endKind].label}
              </span>
            ) : (
              <>
                {clock.kind === 'freeze' && <span className="muted">Freeze </span>}
                {clock.kind === 'bomb' && <span>C4 </span>}
                {formatClock(clock.seconds)}
              </>
            )}
          </div>
        )}
        <div className="hint muted">Space play · ←/→ 5s · ↑/↓ round · scroll zoom</div>
      </div>
      <Scrubber playback={playback} snap={snap} roundMeta={roundMeta} />
    </footer>
  );
}

function Scrubber({ playback, snap, roundMeta }: { playback: Playback; snap: PlaybackSnapshot; roundMeta: RoundMeta }) {
  const track = useRef<HTMLDivElement>(null);
  const start = roundMeta.startTick;
  const span = Math.max(1, roundMeta.officialEndTick - start);
  const pct = (tick: number) => `${((tick - start) / span) * 100}%`;

  const seekTo = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    const f = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    playback.seek(start + f * span);
  };

  const round = snap.round;
  const victimSide = (steamid: string, tick: number) => {
    if (!round) return null;
    const i = round.players.findIndex((p) => p.steamid === steamid);
    return i < 0 ? null : samplePlayer(round, i, tick)?.side;
  };

  return (
    <div
      className="scrubber"
      ref={track}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekTo(e.clientX);
      }}
      onPointerMove={(e) => e.buttons === 1 && seekTo(e.clientX)}
    >
      {roundMeta.freezeEndTick !== null && <div className="freeze" style={{ width: pct(roundMeta.freezeEndTick) }} title="Freeze time" />}
      <div className="after-end" style={{ left: pct(roundMeta.endTick) }} title="Round over" />
      <div className="progress-fill" style={{ width: pct(snap.tick) }} />
      {round?.events.map((e, i) => {
        if (e.type === 'kill') {
          // Marker in the killer's color (opposite to the victim's side).
          const killerCt = victimSide(e.victim, e.tick) !== SIDE_CT;
          return <div key={i} className={`marker kill-marker ${killerCt ? 'ct' : 't'}`} style={{ left: pct(e.tick) }} />;
        }
        if (e.type === 'bomb' && (e.action === 'planted' || e.action === 'defused' || e.action === 'exploded')) {
          return <div key={i} className={`marker bomb ${e.action}`} style={{ left: pct(e.tick) }} title={`Bomb ${e.action}`} />;
        }
        return null;
      })}
      <div className="playhead" style={{ left: pct(snap.tick) }} />
    </div>
  );
}
