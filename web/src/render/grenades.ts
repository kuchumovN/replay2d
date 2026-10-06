import type { GrenadeType } from '@skybox/shared';
import { worldLength } from '../map/transform';
import { sampleGrenade } from '../playback/interp';
import { sideColor, type DrawContext } from './context';

const TRAIL_COLORS: Record<GrenadeType, string> = {
  smoke: '#d8dde3',
  flash: '#fff6a8',
  he: '#ff6b5a',
  molotov: '#ff9a3c',
  decoy: '#8fd18f',
};

/** Effect radii in world units. */
const SMOKE_RADIUS = 144;
const FIRE_RADIUS = 120;
const FLASH_RADIUS = 220;
const HE_RADIUS = 300;

export function drawGrenadeTracks(dc: DrawContext) {
  const { ctx, view, round, tick } = dc;
  for (const track of round.grenades) {
    const head = sampleGrenade(track, tick, round.frameStep);
    if (!head) continue;
    const pts = track.points;
    ctx.strokeStyle = TRAIL_COLORS[track.type];
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i <= head.index; i++) {
      const p = view.project(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    const h = view.project(head.x, head.y, head.z);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = TRAIL_COLORS[track.type];
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(h.x, h.y, Math.max(3, dc.radius * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Smokes and fires are drawn under players; detonation bursts on top. */
export function drawAreaEffects(dc: DrawContext) {
  const { ctx, view, round, tick, map } = dc;
  const unit = view.unit;
  for (const fx of round.effects) {
    if (tick < fx.startTick || tick > fx.endTick || (fx.type !== 'smoke' && fx.type !== 'molotov')) continue;
    const p = view.project(fx.pos.x, fx.pos.y, fx.pos.z);
    const age = (tick - fx.startTick) / dc.meta.tickrate;
    const left = (fx.endTick - tick) / dc.meta.tickrate;
    const grow = Math.min(1, age / 0.75);
    const fade = Math.min(1, left / 1.5);
    const thrower = fx.thrower ? dc.players.get(fx.thrower)?.side : undefined;

    if (fx.type === 'smoke') {
      const radius = worldLength(map, SMOKE_RADIUS) * unit * (0.6 + 0.4 * grow);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(205, 210, 216, 0.72)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sideColor(thrower, true);
      ctx.lineWidth = 2;
      ctx.stroke();
      // Seconds left in the smoke.
      ctx.fillStyle = 'rgba(40, 44, 52, 0.9)';
      ctx.font = `600 ${Math.max(9, Math.min(12, radius * 0.45))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(left)), p.x, p.y);
    } else {
      const radius = worldLength(map, FIRE_RADIUS) * unit * (0.5 + 0.5 * grow);
      const flicker = 0.85 + 0.15 * Math.sin(tick * 0.9);
      ctx.globalAlpha = fade * flicker;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grad.addColorStop(0, 'rgba(255, 210, 90, 0.85)');
      grad.addColorStop(0.6, 'rgba(255, 110, 30, 0.6)');
      grad.addColorStop(1, 'rgba(200, 40, 10, 0.15)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

export function drawBursts(dc: DrawContext) {
  const { ctx, view, round, tick, map } = dc;
  for (const fx of round.effects) {
    if (tick < fx.startTick || tick > fx.endTick || (fx.type !== 'flash' && fx.type !== 'he')) continue;
    const p = view.project(fx.pos.x, fx.pos.y, fx.pos.z);
    const t = (tick - fx.startTick) / Math.max(1, fx.endTick - fx.startTick);
    const max = worldLength(map, fx.type === 'flash' ? FLASH_RADIUS : HE_RADIUS) * view.unit;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = fx.type === 'flash' ? 'rgba(255, 255, 240, 0.8)' : 'rgba(255, 120, 60, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, max * (0.3 + 0.7 * t), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
