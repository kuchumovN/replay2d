import type { MapInfo } from '@skybox/shared';
import type { Playback } from '../playback/playback';
import { drawFrame } from '../render/frame';
import { useRadarCanvas } from './useRadarCanvas';

interface Props {
  playback: Playback;
  map: MapInfo;
  images: HTMLImageElement[];
  names: Map<string, string>;
}

/** Redraws on every animation frame straight from the playback clock (no React re-renders). */
export function RadarCanvas({ playback, map, images, names }: Props) {
  const canvasRef = useRadarCanvas(map, (ctx, width, height, view) =>
    drawFrame({
      ctx,
      width,
      height,
      view,
      map,
      images,
      meta: playback.meta,
      round: playback.round,
      tick: playback.tick,
      speed: playback.speed,
      selected: playback.selected,
      names,
    }),
  );
  return <canvas ref={canvasRef} className="radar-canvas" title="Scroll to zoom, drag to pan, double-click to reset" />;
}
