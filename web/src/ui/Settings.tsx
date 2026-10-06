import { useEffect, useState } from 'react';
import { listModels } from '../api';
import { updateSettings, useSettings } from '../settings';

/** Gear button opening the settings dialog. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="ghost icon-button" onClick={() => setOpen(true)} title="Settings" aria-label="Settings">
        ⚙
      </button>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const [url, setUrl] = useState(s.ollamaUrl);
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!s.analysisEnabled) return;
    let cancelled = false;
    setModelsError(null);
    listModels().then(
      (m) => !cancelled && setModels(m),
      (err: Error) => !cancelled && (setModels(null), setModelsError(err.message)),
    );
    return () => {
      cancelled = true;
    };
  }, [s.analysisEnabled, s.ollamaUrl]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Settings">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="setting toggle">
          <input type="checkbox" checked={s.analysisEnabled} onChange={(e) => updateSettings({ analysisEnabled: e.target.checked })} />
          <span>
            <strong>Route analysis</strong> <span className="badge">experimental</span>
            <span className="muted setting-hint">
              Feed many demos and find the most profitable T routes and CT positions; optional write-up by a local LLM (Ollama).
            </span>
          </span>
        </label>

        {s.analysisEnabled && (
          <div className="setting-group">
            <label className="setting">
              <span>Ollama URL</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => url !== s.ollamaUrl && updateSettings({ ollamaUrl: url.trim() })}
              />
            </label>
            <label className="setting">
              <span>Model</span>
              <select value={s.ollamaModel} onChange={(e) => updateSettings({ ollamaModel: e.target.value })} disabled={!models}>
                <option value="">{models?.length ? `Default (${models[0]})` : 'No models'}</option>
                {models?.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            {modelsError && <div className="error small">{modelsError}</div>}
            <label className="setting">
              <span>Write-up language</span>
              <select value={s.summaryLanguage} onChange={(e) => updateSettings({ summaryLanguage: e.target.value as 'en' | 'ru' })}>
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
