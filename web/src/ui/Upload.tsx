import type { MatchMeta } from '@skybox/shared';
import { useRef, useState } from 'react';
import { openDemo, type ParseProgress } from '../api';
import { desktop } from '../desktop';
import { UpdateButton } from './UpdateButton';

type Phase = { kind: 'idle' } | ParseProgress;

export function Upload({ onReady, initialError }: { onReady: (meta: MatchMeta) => void; initialError: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(initialError);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || phase.kind !== 'idle') return;
    setError(null);
    try {
      setPhase({ kind: 'parsing', stage: 'Starting' });
      onReady(await openDemo(file, setPhase));
    } catch (err) {
      setError((err as Error).message);
      setPhase({ kind: 'idle' });
    }
  }

  const busy = phase.kind !== 'idle';
  return (
    <div className="center">
      <div className="corner">
        <UpdateButton />
      </div>
      <div className="upload-card">
        <h1>
          Skybox <span className="muted">for CS2</span>
        </h1>
        <p className="muted">2D top-down replay of Counter-Strike 2 demos.</p>
        <div
          className={`dropzone${dragging ? ' dragging' : ''}${busy ? ' busy' : ''}`}
          onClick={() => !busy && input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handle(e.dataTransfer.files[0]);
          }}
        >
          {phase.kind === 'idle' && (
            <>
              <div className="dropzone-title">Drop a .dem file here</div>
              <div className="muted">or click to choose</div>
            </>
          )}
          {phase.kind === 'reading' && (
            <>
              <div className="dropzone-title">Reading file… {Math.round(phase.fraction * 100)}%</div>
              <div className="progress">
                <div style={{ width: `${phase.fraction * 100}%` }} />
              </div>
            </>
          )}
          {phase.kind === 'parsing' && (
            <>
              <div className="dropzone-title">Parsing demo</div>
              <div className="muted">{phase.stage}…</div>
              <div className="progress indeterminate">
                <div />
              </div>
            </>
          )}
        </div>
        {!desktop && <p className="muted privacy">Demos are parsed in your browser and never uploaded.</p>}
        {error && <div className="error">{error}</div>}
        <input ref={input} type="file" accept=".dem" hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}
