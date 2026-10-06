import { worldLength } from '../map/transform';
import type { DrawContext } from './context';

/** How long a tracer stays visible, in ticks of game time at 1× speed. */
const TRACER_TICKS = 6;
const TRACER_LENGTH = 700;

export function drawShots(dc: DrawContext) {
  const { ctx, view, round, tick, map } = dc;
  // At higher speeds more game time passes per frame, so keep tracers long enough to be seen.
  const window = TRACER_TICKS * Math.max(1, dc.speed);
  const length = worldLength(map, TRACER_LENGTH) * view.unit;
  ctx.lineCap = 'round';
  for (const e of round.events) {
    if (e.type !== 'shot' || e.tick > tick || e.tick <= tick - window) continue;
    const p = dc.players.get(e.player);
    if (!p || !p.alive) continue;
    const pos = view.project(p.x, p.y, p.z);
    const angle = (-p.yaw * Math.PI) / 180;
    const start = dc.radius * 1.2;
    const x1 = pos.x + Math.cos(angle) * start;
    const y1 = pos.y + Math.sin(angle) * start;
    const x2 = pos.x + Math.cos(angle) * (start + length);
    const y2 = pos.y + Math.sin(angle) * (start + length);
    const alpha = 1 - (tick - e.tick) / window;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, `rgba(255, 240, 180, ${0.9 * alpha})`);
    grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
}
