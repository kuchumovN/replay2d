import { describe, expect, it } from 'vitest';
import { buildMapInfo } from './map-info.js';

const R = 'https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images/radars/';

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
    });
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
    expect(built!.downloads[1].url).toBe(`${R}de_nuke_lower_radar_psd.png`);
  });

  it('uses one unbounded level when there are no vertical sections and prefers psd over tga', () => {
    const built = buildMapInfo('de_cache', {
      radar_paths: [`${R}de_cache_radar_tga.png`, `${R}de_cache_radar_psd.png`],
      radar_info: { pos_x: 0, pos_y: 0, scale: 5 },
    });
    expect(built!.info.levels).toEqual([{ name: 'default', image: 'de_cache/default.png', altitudeMin: -100000, altitudeMax: 100000 }]);
    expect(built!.downloads[0].url).toBe(`${R}de_cache_radar_psd.png`);
  });

  it('skips maps without calibration or a main radar', () => {
    expect(buildMapInfo('de_x', { radar_paths: [`${R}de_x_radar_psd.png`] })).toBeNull();
    expect(buildMapInfo('de_x', { radar_paths: [`${R}de_x_v1_radar_psd.png`], radar_info: { pos_x: 0, pos_y: 0, scale: 1 } })).toBeNull();
  });
});
