import { describe, expect, it } from 'vitest';
import { buildMapInfo } from './map-info.js';

const R = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars/';
const COMMIT = 'abc123';
const PINNED = `https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/${COMMIT}/images/radars/`;
const calibration = { pos_x: 0, pos_y: 0, scale: 5 };

describe('buildMapInfo', () => {
  it('builds levels for multi-level maps, top level first', () => {
    const built = buildMapInfo('de_nuke', {
      display_name: 'Nuke',
      radar_paths: [`${R}de_nuke_lower_radar_psd.png`, `${R}de_nuke_radar_psd.png`],
      radar_info: {
        pos_x: -3453,
        pos_y: 2887,
        scale: 7,
        verticalsections: {
          lower: { AltitudeMax: -495, AltitudeMin: -10000 },
          default: { AltitudeMax: 10000, AltitudeMin: -495 },
        },
      },
    }, COMMIT);
    expect(built!.info).toEqual({
      name: 'de_nuke',
      displayName: 'Nuke',
      posX: -3453,
      posY: 2887,
      scale: 7,
      levels: [
        { name: 'default', image: 'de_nuke/default.png', altitudeMin: -495, altitudeMax: 10000 },
        { name: 'lower', image: 'de_nuke/lower.png', altitudeMin: -10000, altitudeMax: -495 },
      ],
    });
    expect(built!.downloads[1].url).toBe(`${PINNED}de_nuke_lower_radar_psd.png`);
  });

  it('uses one unbounded level when there are no vertical sections and prefers psd over tga', () => {
    const built = buildMapInfo('de_cache', {
      radar_paths: [`${R}de_cache_radar_tga.png`, `${R}de_cache_radar_psd.png`],
      radar_info: calibration,
    }, COMMIT);
    expect(built!.info.levels).toEqual([{ name: 'default', image: 'de_cache/default.png', altitudeMin: -100000, altitudeMax: 100000 }]);
    expect(built!.downloads[0].url).toBe(`${PINNED}de_cache_radar_psd.png`);
  });

  it('skips maps without calibration or a main radar', () => {
    expect(buildMapInfo('de_x', { radar_paths: [`${R}de_x_radar_psd.png`] }, COMMIT)).toBeNull();
    expect(buildMapInfo('de_x', { radar_paths: [`${R}de_x_v1_radar_psd.png`], radar_info: { pos_x: 0, pos_y: 0, scale: 1 } }, COMMIT)).toBeNull();
  });

  it('rejects names that could escape the output directory', () => {
    const map = (name: string) => ({ radar_paths: [`${R}${name}_radar_psd.png`], radar_info: calibration });
    expect(buildMapInfo('../../src/main', map('../../src/main'), COMMIT)).toBeNull();
    expect(buildMapInfo('de_x/..', map('de_x/..'), COMMIT)).toBeNull();
    const built = buildMapInfo('de_x', {
      radar_paths: [`${R}de_x_radar_psd.png`, `${R}de_x_../../evil_radar_psd.png`],
      radar_info: {
        ...calibration,
        verticalsections: { default: { AltitudeMax: 1, AltitudeMin: 0 }, '../../evil': { AltitudeMax: 0, AltitudeMin: -1 } },
      },
    }, COMMIT);
    expect(built!.info.levels.map((l) => l.name)).toEqual(['default']);
  });

  it('downloads from the pinned commit, wherever the index points', () => {
    const built = buildMapInfo('de_x', { radar_paths: ['https://evil.example/de_x_radar_psd.png'], radar_info: calibration }, COMMIT);
    expect(built!.downloads[0].url).toBe(`${PINNED}de_x_radar_psd.png`);
  });

  it('rejects non-numeric calibration', () => {
    const radar_info = { ...calibration, scale: '5' as unknown as number };
    expect(buildMapInfo('de_x', { radar_paths: [`${R}de_x_radar_psd.png`], radar_info }, COMMIT)).toBeNull();
  });
});
