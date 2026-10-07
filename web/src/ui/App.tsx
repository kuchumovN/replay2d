import type { MatchMeta } from '@skybox/shared';
import { useEffect, useState } from 'react';
import { getStatus } from '../api';
import { Upload } from './Upload';
import { Viewer } from './Viewer';

/** The open demo lives in the URL hash so a page reload keeps it while the server is running. */
function idFromHash(): string | null {
  return /^#\/demo\/([\w-]+)/.exec(location.hash)?.[1] ?? null;
}

export function App() {
  const [id, setId] = useState(idFromHash);
  const [meta, setMeta] = useState<MatchMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setId(idFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!id) {
      setMeta(null);
      return;
    }
    if (meta?.id === id) return;
    let cancelled = false;
    getStatus(id)
      .then((status) => {
        if (cancelled) return;
        if (status.state === 'ready') setMeta(status.meta);
        else {
          setError(status.state === 'error' ? status.error : 'Demo is still being parsed.');
          location.hash = '';
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        location.hash = '';
      });
    return () => {
      cancelled = true;
    };
  }, [id, meta?.id]);

  if (id && meta?.id === id) {
    return <Viewer meta={meta} onClose={() => (location.hash = '')} />;
  }
  if (id) return <div className="center muted">Loading…</div>;
  return (
    <Upload
      initialError={error}
      onReady={(m) => {
        setMeta(m);
        setError(null);
        location.hash = `#/demo/${m.id}`;
      }}
    />
  );
}
