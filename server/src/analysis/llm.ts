import type { SummaryRequest } from '@skybox/shared';

export class LlmError extends Error {}

async function call<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') throw new LlmError('Ollama did not answer in time.');
    throw new LlmError('Ollama is not reachable. Install it from ollama.com and make sure it is running.');
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new LlmError(`Ollama: ${body.error ?? res.status}`);
  return body;
}

export async function listModels(baseUrl: string): Promise<string[]> {
  const body = await call<{ models?: { name: string }[] }>(`${baseUrl.replace(/\/$/, '')}/api/tags`);
  return (body.models ?? []).map((m) => m.name).sort();
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** Below this many samples a row is flagged so the model does not present it as a reliable finding. */
const RELIABLE_SAMPLES = 5;

/** Small local models drift into translating map callouts; the language rule works best as a system message. */
export function systemPrompt(language: 'en' | 'ru'): string {
  const callouts =
    'Callout names such as BombsiteA, PalaceInterior or TSpawn are proper names: copy them verbatim in Latin letters, never translate them.';
  return language === 'ru'
    ? `Ты аналитик Counter-Strike 2. Отвечай только на русском языке. ${callouts}`
    : `You are a Counter-Strike 2 analyst. Answer in English. ${callouts}`;
}

export function summaryPrompt(req: SummaryRequest): string {
  const what = req.side === 'T' ? 'T-side routes (callouts visited in order during the first part of the round)' : 'CT-side positions (callout held before first contact)';
  const rows = req.groups
    .map((g, i) => {
      const winRate = g.lives ? Math.round((g.roundsWon / g.lives) * 100) : 0;
      const flag = g.lives < RELIABLE_SAMPLES ? ' | LOW SAMPLE' : '';
      return `${i + 1}. ${g.places.join(' > ')} | samples ${g.lives} | kills ${g.kills} | deaths ${g.deaths} | (kills-deaths)/life ${fmt(g.score)} | rounds won ${winRate}%${flag}`;
    })
    .join('\n');
  return [
    `Data: ${what} on ${req.map}, from ${req.demos} demo(s), players: ${req.players.join(', ') || 'all'}.`,
    req.side === 'T' ? `Routes cover the first ${req.window} seconds after freeze time.` : '',
    'Rows are sorted from most to least profitable by (kills-deaths)/life:',
    rows,
    '',
    'Write a short practical breakdown: which routes/positions pay off and why they likely work on this map, which ones to avoid,',
    `and how reliable the conclusions are. Rows marked LOW SAMPLE (fewer than ${RELIABLE_SAMPLES} samples) are anecdotal: say so and never call them reliable.`,
    'Use only the numbers above; do not invent statistics.',
    `At most ~250 words, short bullet points ("- ") under a few bold headings.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function summarize(baseUrl: string, model: string, req: SummaryRequest, language: 'en' | 'ru'): Promise<string> {
  const chosen = model || (await listModels(baseUrl))[0];
  if (!chosen) throw new LlmError('No models installed in Ollama. Run `ollama pull qwen3:8b` (or another model).');
  const chat = (think: boolean | undefined) =>
    call<{ message?: { content?: string } }>(
      `${baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: chosen,
          stream: false,
          think,
          options: { temperature: 0.3 },
          messages: [
            { role: 'system', content: systemPrompt(language) },
            { role: 'user', content: summaryPrompt(req) },
          ],
        }),
      },
      // The first request also loads the model into memory.
      300_000,
    );
  let body;
  try {
    // Reasoning models (qwen3, deepseek-r1) would otherwise spend minutes "thinking" before answering.
    body = await chat(false);
  } catch (err) {
    if (!(err instanceof LlmError) || !/think/i.test(err.message)) throw err;
    body = await chat(undefined);
  }
  return (body.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
