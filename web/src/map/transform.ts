import type { MapInfo } from '@replay2d/shared';

/** Overview calibration is defined for a 1024×1024 radar regardless of the texture resolution. */
export const RADAR_SIZE = 1024;

/** World coordinates → radar pixels (0..1024). */
export function worldToRadar(map: MapInfo, x: number, y: number): { x: number; y: number } {
  return { x: (x - map.posX) / map.scale, y: (map.posY - y) / map.scale };
}

/** World distance → radar pixels. */
export function worldLength(map: MapInfo, units: number): number {
  return units / map.scale;
}

/** Index of the level (radar image) an entity at height z belongs to. */
export function levelIndex(map: MapInfo, z: number | null | undefined): number {
  if (z == null || map.levels.length < 2) return 0;
  const i = map.levels.findIndex((l) => z >= l.altitudeMin && z < l.altitudeMax);
  return i < 0 ? 0 : i;
}
