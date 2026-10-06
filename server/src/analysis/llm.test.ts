import { describe, expect, it } from 'vitest';
import { summaryPrompt, systemPrompt } from './llm.js';

describe('summary prompt', () => {
  const prompt = summaryPrompt({
    map: 'Mirage',
    side: 'T',
    players: ['donk'],
    demos: 3,
    window: 30,
    groups: [
      { places: ['TSpawn', 'Mid', 'Short'], lives: 12, kills: 10, deaths: 4, roundsWon: 8, score: 0.5 },
      { places: ['TSpawn', 'Palace'], lives: 2, kills: 2, deaths: 0, roundsWon: 2, score: 1 },
    ],
  });

  it('lists the computed rows and flags small samples', () => {
    expect(prompt).toContain('1. TSpawn > Mid > Short | samples 12 | kills 10 | deaths 4 | (kills-deaths)/life 0.5 | rounds won 67%');
    expect(prompt).toMatch(/2\. TSpawn > Palace .* \| LOW SAMPLE$/m);
    expect(prompt).toContain('first 30 seconds');
  });

  it('sets the answer language in the system message', () => {
    expect(systemPrompt('ru')).toContain('русском');
    expect(systemPrompt('en')).toContain('English');
  });
});
