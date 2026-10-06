import type { MatchMeta } from '@skybox/shared';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Playback } from '../playback/playback';
import { scoreAt } from '../playback/state';
import { KillFeed } from './KillFeed';
import { RadarCanvas } from './RadarCanvas';
import { Scoreboard } from './Scoreboard';
import { Timeline } from './Timeline';
import { useRadar } from './useRadar';
import { SettingsButton } from './Settings';
import { UpdateButton } from './UpdateButton';

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
}

export function Viewer({ meta, onClose }: { meta: MatchMeta; onClose: () => void }) {
  const playback = useMemo(() => new Playback(meta, meta.id), [meta]);
  const snap = useSyncExternalStore(playback.subscribe, playback.getSnapshot);
  const { radar, error } = useRadar(meta.mapName);
  const names = useMemo(() => new Map(meta.players.map((p) => [p.steamid, p.name])), [meta]);

  useEffect(() => {
    playback.start();
    return () => playback.stop();
  }, [playback]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        ' ': () => playback.togglePlay(),
        ArrowLeft: () => playback.seekSeconds(e.shiftKey ? -1 : -5),
        ArrowRight: () => playback.seekSeconds(e.shiftKey ? 1 : 5),
        ArrowUp: () => playback.goToRound(playback.roundIndex - 1),
        ArrowDown: () => playback.goToRound(playback.roundIndex + 1),
        '+': () => playback.changeSpeed(1),
        '=': () => playback.changeSpeed(1),
        '-': () => playback.changeSpeed(-1),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback]);

  const roundMeta = meta.rounds[snap.roundIndex];
  const score = scoreAt(roundMeta, snap.tick);

  return (
    <div className="viewer">
      <header className="topbar">
        <button className="ghost" onClick={onClose} title="Open another demo">
          ← Demos
        </button>
        <div className="topbar-title">
          <span className="map-name">{radar?.map.displayName ?? meta.mapName}</span>
          <span className="muted file-name">{meta.fileName}</span>
        </div>
        <div className="score">
          <span className="team ct">{roundMeta.ctName}</span>
          <span className="score-num ct">{score.ct}</span>
          <span className="muted">:</span>
          <span className="score-num t">{score.t}</span>
          <span className="team t">{roundMeta.tName}</span>
        </div>
        <div className="topbar-end">
          <UpdateButton />
          <SettingsButton />
        </div>
      </header>
      <main className="stage">
        <div className="radar-area">
          {radar ? (
            <RadarCanvas playback={playback} map={radar.map} images={radar.images} names={names} />
          ) : (
            <div className="center muted">{error ?? 'Loading radar…'}</div>
          )}
          {snap.round && <KillFeed round={snap.round} tick={snap.tick} names={names} />}
          {!snap.round && !snap.error && radar && <div className="overlay-note">Loading round…</div>}
          {snap.error && <div className="overlay-note error">{snap.error}</div>}
        </div>
        <Scoreboard snap={snap} meta={meta} names={names} onSelect={(id) => playback.select(id)} />
      </main>
      <Timeline playback={playback} snap={snap} meta={meta} />
    </div>
  );
}
