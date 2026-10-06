import type { MatchMeta } from '@skybox/shared';
import { useRef, useState } from 'react';
import { getStatus, openLocalDemo, uploadDemo } from '../api';
import { desktop } from '../desktop';
import { UpdateButton } from './UpdateButton';

const POLL_MS = 400;

type Phase = { kind: 'idle' } | { kind: 'uploading'; fraction: number } | { kind: 'parsing'; stage: string };

export function Upload({ onReady, initialError }: { onReady: (meta: MatchMeta) => void; initialError: string | null }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(initialError);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File | undefined) {
    if (!file || phase.kind !== 'idle') return;
    setError(null);
    try {
      // The desktop app reads the file in place; the browser has to upload it.
      const localPath = desktop?.pathForFile(file);
      let id: string;
      if (localPath) {
        id = await openLocalDemo(localPath);
      } else {
        setPhase({ kind: 'uploading', fraction: 0 });
        id = await uploadDemo(file, (fraction) => setPhase({ kind: 'uploading', fraction }));
      }
      setPhase({ kind: 'parsing', stage: 'Starting' });
      for (;;) {
        const status = await getStatus(id);
        if (status.state === 'ready') return onReady(status.meta);
        if (status.state === 'error') throw new Error(status.error);
        setPhase({ kind: 'parsing', stage: status.stage });
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
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
          {phase.kind === 'uploading' && (
            <>
              <div className="dropzone-title">Uploading… {Math.round(phase.fraction * 100)}%</div>
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
        {error && <div className="error">{error}</div>}
        <input ref={input} type="file" accept=".dem" hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}
