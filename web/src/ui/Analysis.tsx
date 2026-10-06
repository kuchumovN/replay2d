import {
  analyze,
  DEFAULT_ANALYSIS,
  mergePlaces,
  SIDE_CT,
  SIDE_T,
  type AnalysisJob,
  type DemoExtract,
  type GroupStats,
  type LibraryDemo,
  type Side,
} from '@skybox/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addAnalysisDemo, getAnalysisJob, getMapExtracts, listAnalysisDemos, removeAnalysisDemo, summarize } from '../api';
import { drawAnalysis, scoreColor } from '../render/analysis';
import { useSettings } from '../settings';
import { SettingsButton } from './Settings';
import { UpdateButton } from './UpdateButton';
import { useRadar, type Radar } from './useRadar';
import { useRadarCanvas } from './useRadarCanvas';

const POLL_MS = 700;
const MAX_ROWS = 40;

interface Job {
  id: string;
  fileName: string;
  job: AnalysisJob;
}

export function Analysis({ onClose }: { onClose: () => void }) {
  const [library, setLibrary] = useState<LibraryDemo[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<string | null>(null);
  const [extracts, setExtracts] = useState<DemoExtract[]>([]);
  const [players, setPlayers] = useState<Set<string>>(new Set());
  const [side, setSide] = useState<Side>(SIDE_T);
  const [routeWindow, setRouteWindow] = useState(DEFAULT_ANALYSIS.window);
  const [minSamples, setMinSamples] = useState(2);
  const [selected, setSelected] = useState<number | null>(null);

  const refreshLibrary = () => listAnalysisDemos().then(setLibrary, (err: Error) => setError(err.message));
  useEffect(() => void refreshLibrary(), []);

  const maps = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of library) counts.set(d.mapName, (counts.get(d.mapName) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [library]);
  useEffect(() => {
    if (!map || !maps.some(([m]) => m === map)) setMap(maps[0]?.[0] ?? null);
  }, [maps, map]);

  useEffect(() => {
    if (!map) return setExtracts([]);
    let cancelled = false;
    getMapExtracts(map).then((e) => !cancelled && setExtracts(e), (err: Error) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [map, library]);

  // Poll queued/parsing jobs; a finished one refreshes the library.
  useEffect(() => {
    if (!jobs.some((j) => j.job.state === 'parsing')) return;
    const timer = setTimeout(async () => {
      const next = await Promise.all(
        jobs.map(async (j) => (j.job.state === 'parsing' ? { ...j, job: await getAnalysisJob(j.id).catch((err: Error) => ({ state: 'error', error: err.message }) as const) } : j)),
      );
      setJobs(next);
      if (next.some((j, i) => j.job.state === 'ready' && jobs[i].job.state !== 'ready')) refreshLibrary();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [jobs]);

  async function addFiles(files: FileList | null) {
    setError(null);
    for (const file of Array.from(files ?? [])) {
      try {
        const id = await addAnalysisDemo(file);
        setJobs((js) => [...js, { id, fileName: file.name, job: { state: 'parsing', stage: 'Queued' } }]);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
  }

  const mapPlayers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of extracts) for (const p of e.players) byId.set(p.steamid, p.name);
    return [...byId].map(([steamid, name]) => ({ steamid, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [extracts]);
  const names = useMemo(() => new Map(mapPlayers.map((p) => [p.steamid, p.name])), [mapPlayers]);

  const places = useMemo(() => mergePlaces(extracts), [extracts]);
  const groups = useMemo(() => {
    if (players.size === 0) return [];
    const lives = extracts.flatMap((e) => e.lives);
    return analyze(lives, { side, players, window: routeWindow, minVisit: DEFAULT_ANALYSIS.minVisit })
      .filter((g) => g.lives >= minSamples)
      .slice(0, MAX_ROWS);
  }, [extracts, players, side, routeWindow, minSamples]);
  useEffect(() => setSelected(null), [groups]);

  const { radar, error: radarError } = useRadar(map ?? '');
  const togglePlayer = (id: string) =>
    setPlayers((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="viewer analysis">
      <header className="topbar">
        <button className="ghost" onClick={onClose} title="Back to demos">
          ← Demos
        </button>
        <div className="topbar-title">
          <span className="map-name">Route analysis</span>
          <span className="badge">experimental</span>
        </div>
        <select value={map ?? ''} onChange={(e) => setMap(e.target.value)} disabled={maps.length === 0}>
          {maps.length === 0 && <option value="">No demos yet</option>}
          {maps.map(([m, n]) => (
            <option key={m} value={m}>
              {m} ({n})
            </option>
          ))}
        </select>
        <div className="segmented">
          <button className={side === SIDE_T ? 'active t' : ''} onClick={() => setSide(SIDE_T)}>
            T routes
          </button>
          <button className={side === SIDE_CT ? 'active ct' : ''} onClick={() => setSide(SIDE_CT)}>
            CT positions
          </button>
        </div>
        <div className="topbar-end">
          <UpdateButton />
          <SettingsButton />
        </div>
      </header>

      <main className="analysis-stage">
        <aside className="panel">
          <Library library={library} jobs={jobs} onAdd={addFiles} onRemove={(id) => removeAnalysisDemo(id).then(refreshLibrary, (err: Error) => setError(err.message))} />
          {error && <div className="error small">{error}</div>}
          <section>
            <div className="panel-title">
              <span>Players</span>
              <span className="panel-actions">
                <button className="ghost small" onClick={() => setPlayers(new Set(mapPlayers.map((p) => p.steamid)))}>
                  All
                </button>
                <button className="ghost small" onClick={() => setPlayers(new Set())}>
                  None
                </button>
              </span>
            </div>
            {mapPlayers.length === 0 && <div className="muted small">Add demos to pick players.</div>}
            {mapPlayers.map((p) => (
              <label key={p.steamid} className="check-row">
                <input type="checkbox" checked={players.has(p.steamid)} onChange={() => togglePlayer(p.steamid)} />
                {p.name}
              </label>
            ))}
          </section>
        </aside>

        <div className="radar-area">
          {radar && radar.map.name === map ? (
            <AnalysisRadar radar={radar} groups={groups} places={places} side={side} selected={selected} />
          ) : (
            <div className="center muted">{map ? (radarError ?? 'Loading radar…') : 'Add demos on the left to start.'}</div>
          )}
          {map && players.size === 0 && <div className="overlay-note">Select players on the left</div>}
        </div>

        <aside className="panel">
          <section className="analysis-controls">
            {side === SIDE_T && (
              <label className="setting">
                <span>Route window: first {routeWindow} s</span>
                <input type="range" min={10} max={60} step={5} value={routeWindow} onChange={(e) => setRouteWindow(Number(e.target.value))} />
              </label>
            )}
            <label className="setting">
              <span>Min. samples: {minSamples}</span>
              <input type="range" min={1} max={10} value={minSamples} onChange={(e) => setMinSamples(Number(e.target.value))} />
            </label>
          </section>
          <GroupTable groups={groups} side={side} selected={selected} onSelect={(i) => setSelected((s) => (s === i ? null : i))} />
          <Summary
            key={`${map}-${side}`}
            disabled={groups.length === 0}
            request={() => ({
              map: radar?.map.displayName ?? map ?? '',
              side: side === SIDE_T ? 'T' : 'CT',
              players: [...players].map((id) => names.get(id) ?? id),
              demos: extracts.length,
              window: routeWindow,
              groups: groups.slice(0, 15).map(({ places, lives, kills, deaths, roundsWon, score }) => ({ places, lives, kills, deaths, roundsWon, score })),
            })}
          />
        </aside>
      </main>
    </div>
  );
}

function Library({ library, jobs, onAdd, onRemove }: { library: LibraryDemo[]; jobs: Job[]; onAdd: (files: FileList | null) => void; onRemove: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const active = jobs.filter((j) => j.job.state !== 'ready');
  return (
    <section>
      <div className="panel-title">
        <span>Demos ({library.length})</span>
      </div>
      <div
        className={`dropzone small${dragging ? ' dragging' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onAdd(e.dataTransfer.files);
        }}
      >
        Drop .dem files here or click
        <input ref={input} type="file" accept=".dem" multiple hidden onChange={(e) => (onAdd(e.target.files), (e.target.value = ''))} />
      </div>
      {active.map((j) => (
        <div key={j.id} className={`library-row${j.job.state === 'error' ? ' error' : ''}`} title={j.job.state === 'error' ? j.job.error : undefined}>
          <span className="library-name">{j.fileName}</span>
          <span className="muted small">{j.job.state === 'parsing' ? j.job.stage : 'Failed'}</span>
        </div>
      ))}
      {library.map((d) => (
        <div key={d.id} className="library-row" title={`${d.rounds} rounds · ${d.players.map((p) => p.name).join(', ')}`}>
          <span className="library-name">{d.fileName}</span>
          <span className="muted small">{d.mapName}</span>
          <button className="ghost small" onClick={() => onRemove(d.id)} title="Remove from library">
            ✕
          </button>
        </div>
      ))}
    </section>
  );
}

function GroupTable({ groups, side, selected, onSelect }: { groups: GroupStats[]; side: Side; selected: number | null; onSelect: (i: number) => void }) {
  if (groups.length === 0) return <div className="muted small">No {side === SIDE_T ? 'routes' : 'positions'} with enough samples.</div>;
  return (
    <table className="group-table">
      <thead>
        <tr>
          <th>{side === SIDE_T ? 'Route' : 'Position'}</th>
          <th title="Lives (samples)">N</th>
          <th title="Kills">K</th>
          <th title="Deaths">D</th>
          <th title="Rounds won">Win</th>
          <th title="(kills - deaths) per life">±/life</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => (
          <tr key={g.places.join('>')} className={selected === i ? 'selected' : ''} onClick={() => onSelect(i)}>
            <td className="route-cell">{(side === SIDE_T ? g.places.filter((p) => !/spawn/i.test(p)) : g.places).join(' → ') || g.places[0]}</td>
            <td>{g.lives}</td>
            <td>{g.kills}</td>
            <td>{g.deaths}</td>
            <td>{Math.round((g.roundsWon / g.lives) * 100)}%</td>
            <td style={{ color: scoreColor(g.score) }}>{g.score > 0 ? '+' : ''}{g.score.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Summary({ disabled, request }: { disabled: boolean; request: () => Parameters<typeof summarize>[0] }) {
  const settings = useSettings();
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'done'; text: string } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const run = () => {
    setState({ kind: 'loading' });
    summarize(request()).then(
      (text) => setState({ kind: 'done', text }),
      (err: Error) => setState({ kind: 'error', message: err.message }),
    );
  };
  return (
    <section className="summary">
      <div className="panel-title">
        <span>LLM write-up</span>
        <button onClick={run} disabled={disabled || state.kind === 'loading'} title={`Ollama · ${settings.ollamaModel || 'default model'}`}>
          {state.kind === 'loading' ? 'Thinking…' : state.kind === 'done' ? 'Regenerate' : 'Summarize'}
        </button>
      </div>
      {state.kind === 'loading' && <div className="muted small">The first request also loads the model, this can take a minute.</div>}
      {state.kind === 'done' && <SummaryText text={state.text} />}
      {state.kind === 'error' && <div className="error small">{state.message}</div>}
    </section>
  );
}

/** Renders the small markdown subset LLMs tend to produce: "- " bullets (nested by indent) and **bold**. */
function SummaryText({ text }: { text: string }) {
  const inline = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
  return (
    <div className="summary-text">
      {text.split('\n').map((line, i) => {
        const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <div key={i} className="summary-bullet" style={{ marginLeft: Math.min(bullet[1].length, 8) * 6 }}>
              {inline(bullet[2])}
            </div>
          );
        }
        return line.trim() ? <div key={i}>{inline(line.replace(/^#+\s*/, ''))}</div> : <div key={i} className="summary-gap" />;
      })}
    </div>
  );
}

function AnalysisRadar({ radar, groups, places, side, selected }: { radar: Radar; groups: GroupStats[]; places: ReturnType<typeof mergePlaces>; side: Side; selected: number | null }) {
  const canvasRef = useRadarCanvas(radar.map, (ctx, width, height, view) =>
    drawAnalysis({ ctx, width, height, view, map: radar.map, images: radar.images, groups, places, kind: side === SIDE_T ? 'routes' : 'positions', selected }),
  );
  return <canvas ref={canvasRef} className="radar-canvas" title="Scroll to zoom, drag to pan, double-click to reset" />;
}
