import type { MapInfo, MatchMeta } from '@skybox/shared';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getMaps, loadImage } from '../api';
import { Playback } from '../playback/playback';
import { scoreAt } from '../playback/state';
import { KillFeed } from './KillFeed';
import { RadarCanvas } from './RadarCanvas';
import { Scoreboard } from './Scoreboard';
import { Timeline } from './Timeline';
import { UpdateButton } from './UpdateButton';

interface Radar {
  map: MapInfo;
  images: HTMLImageElement[];
}

function useRadar(mapName: string) {
  const [radar, setRadar] = useState<Radar | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maps = await getMaps();
      const map = maps[mapName];
      if (!map) throw new Error(`No radar for ${mapName}. Run \`npm run fetch-maps\` to download radar images, then reload.`);
      const images = await Promise.all(map.levels.map((l) => loadImage(`maps/${l.image}`)));
      if (!cancelled) setRadar({ map, images });
    })().catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mapName]);
  return { radar, error };
}

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
        <UpdateButton />
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
