import type { GroupStats, MapInfo } from '@skybox/shared';
import { clipToLevels, drawRadar } from './frame';
import type { View } from './view';

export interface AnalysisFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  view: View;
  map: MapInfo;
  images: HTMLImageElement[];
  groups: GroupStats[];
  places: Map<string, { x: number; y: number; z: number }>;
  /** T draws routes as lines, CT draws held positions as circles. */
  kind: 'routes' | 'positions';
  selected: number | null;
}

/** Red (losing) → yellow → green (profitable); score is (kills - deaths) per life. */
export function scoreColor(score: number, alpha = 1): string {
  const t = Math.max(-1, Math.min(1, score));
  return `hsla(${Math.round(60 + t * 60)}, 80%, 55%, ${alpha})`;
}

export function drawAnalysis(f: AnalysisFrame) {
  const { ctx, view } = f;
  ctx.clearRect(0, 0, f.width, f.height);
  view.layout(f.width, f.height);
  drawRadar(ctx, view, f.map, f.images);

  ctx.save();
  clipToLevels(ctx, view);
  const maxLives = Math.max(1, ...f.groups.map((g) => g.lives));
  const at = (place: string) => {
    const p = f.places.get(place);
    return p ? view.project(p.x, p.y, p.z) : null;
  };
  // Selected item last so it is on top.
  const order = f.groups.map((_, i) => i).filter((i) => i !== f.selected);
  if (f.selected !== null && f.groups[f.selected]) order.push(f.selected);
  const dim = f.selected !== null;

  for (const i of order) {
    const g = f.groups[i];
    const active = i === f.selected;
    const weight = Math.sqrt(g.lives / maxLives);
    const alpha = active ? 1 : dim ? 0.18 : 0.75;
    if (f.kind === 'routes') {
      const pts = g.places.map(at).filter((p) => p !== null);
      if (pts.length < 2) continue;
      ctx.strokeStyle = scoreColor(g.score, alpha);
      ctx.lineWidth = active ? 5 : 1.5 + weight * 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      arrowHead(ctx, pts[pts.length - 2], pts[pts.length - 1], ctx.lineWidth * 2 + 6, scoreColor(g.score, alpha));
      if (active) {
        g.places.forEach((place) => {
          const p = at(place);
          if (p) label(ctx, place, p.x, p.y);
        });
      }
    } else {
      const p = at(g.places[0]);
      if (!p) continue;
      const r = 6 + weight * 16;
      ctx.fillStyle = scoreColor(g.score, active ? 0.85 : dim ? 0.15 : 0.55);
      ctx.strokeStyle = active ? '#fff' : scoreColor(g.score, alpha);
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (active || !dim) label(ctx, g.places[0], p.x, p.y - r - 4);
    }
  }
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number, color: string) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(a - 0.45), to.y - size * Math.sin(a - 0.45));
  ctx.lineTo(to.x - size * Math.cos(a + 0.45), to.y - size * Math.sin(a + 0.45));
  ctx.closePath();
  ctx.fill();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, x, y);
}
