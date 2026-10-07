import type { MapInfo, MatchMeta, RoundData } from '@replay2d/shared';
import { samplePlayer, type PlayerSample } from '../playback/interp';
import { bombState } from '../playback/state';
import { drawBomb } from './bomb';
import type { DrawContext } from './context';
import { drawAreaEffects, drawBursts, drawGrenadeTracks } from './grenades';
import { drawDeaths, drawPlayers } from './players';
import { drawShots } from './shots';
import type { View } from './view';

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  view: View;
  map: MapInfo;
  images: HTMLImageElement[];
  meta: MatchMeta;
  round: RoundData | null;
  tick: number;
  speed: number;
  selected: string | null;
  names: Map<string, string>;
}

export function drawFrame(f: FrameInput) {
  const { ctx, view, map } = f;
  ctx.clearRect(0, 0, f.width, f.height);
  view.layout(f.width, f.height);

  const players = new Map<string, PlayerSample>();
  if (f.round) {
    for (let i = 0; i < f.round.players.length; i++) {
      const s = samplePlayer(f.round, i, f.tick);
      if (s) players.set(f.round.players[i].steamid, s);
    }
  }
  const dc: DrawContext | null = f.round
    ? {
        ctx,
        view,
        map,
        meta: f.meta,
        round: f.round,
        tick: f.tick,
        speed: f.speed,
        selected: f.selected,
        names: f.names,
        players,
        bomb: bombState(f.round, f.tick, f.meta.tickrate),
        radius: Math.max(5, Math.min(14, view.unit * 9)),
      }
    : null;

  // Each level is clipped to its own viewport; entities are drawn on the level matching their height.
  view.rects.forEach((rect, level) => {
    const clip = view.clips[level];
    ctx.save();
    ctx.beginPath();
    ctx.rect(clip.x, clip.y, clip.w, clip.h);
    ctx.clip();
    if (map.levels.length > 1) {
      ctx.fillStyle = '#0d1014';
      ctx.fillRect(rect.x, rect.y, rect.size, rect.size);
    }
    const tl = view.radarToScreen(level, 0, 0);
    const img = f.images[level];
    if (img) ctx.drawImage(img, tl.x, tl.y, rect.size * view.zoom, rect.size * view.zoom);
    if (map.levels.length > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(map.levels[level].name === 'default' ? 'Upper' : capitalize(map.levels[level].name), rect.x + 10, rect.y + 10);
    }
    ctx.restore();
  });

  if (!dc) return;
  // Entities may cross level borders; clip to the union of viewports.
  ctx.save();
  ctx.beginPath();
  for (const c of view.clips) ctx.rect(c.x, c.y, c.w, c.h);
  ctx.clip();
  drawAreaEffects(dc);
  drawDeaths(dc);
  drawGrenadeTracks(dc);
  drawShots(dc);
  drawBomb(dc);
  drawPlayers(dc);
  drawBursts(dc);
  ctx.restore();
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
