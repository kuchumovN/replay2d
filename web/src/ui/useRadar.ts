import type { MapInfo } from '@skybox/shared';
import { useEffect, useState } from 'react';
import { getMaps, loadImage } from '../api';

export interface Radar {
  map: MapInfo;
  images: HTMLImageElement[];
}

/** Radar calibration and level images of a map. */
export function useRadar(mapName: string) {
  const [radar, setRadar] = useState<Radar | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maps = await getMaps();
      const map = maps[mapName];
      if (!map) throw new Error(`No radar for ${mapName}. Run \`npm run fetch-maps\` to download radar images, then reload.`);
      const images = await Promise.all(map.levels.map((l) => loadImage(`/maps/${l.image}`)));
      if (!cancelled) setRadar({ map, images });
    })().catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mapName]);
  return { radar, error };
}
