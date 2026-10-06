import { blindAmount, killsUntil } from '../playback/state';
import { COLORS, sideColor, type DrawContext } from './context';

/** Crosses where players died this round. */
export function drawDeaths(dc: DrawContext) {
  const { ctx, view, radius } = dc;
  const s = radius * 0.7;
  for (const kill of killsUntil(dc.round, dc.tick)) {
    const p = view.project(kill.victimPos.x, kill.victimPos.y, kill.victimPos.z);
    ctx.strokeStyle = sideColor(dc.players.get(kill.victim)?.side, true);
    ctx.lineWidth = Math.max(2, radius * 0.3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x - s, p.y - s);
    ctx.lineTo(p.x + s, p.y + s);
    ctx.moveTo(p.x + s, p.y - s);
    ctx.lineTo(p.x - s, p.y + s);
    ctx.stroke();
  }
}

export function drawPlayers(dc: DrawContext) {
  const { ctx, view, radius: r } = dc;
  const carrier = dc.bomb?.kind === 'carried' ? dc.bomb.player : null;

  // Selected player last so it is drawn on top.
  const entries = [...dc.players].filter(([, p]) => p.alive).sort(([a], [b]) => Number(a === dc.selected) - Number(b === dc.selected));
  for (const [steamid, p] of entries) {
    const pos = view.project(p.x, p.y, p.z);
    const color = sideColor(p.side);
    const angle = (-p.yaw * Math.PI) / 180;

    // View cone.
    const cone = r * 4.5;
    const grad = ctx.createRadialGradient(pos.x, pos.y, r, pos.x, pos.y, cone);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.arc(pos.x, pos.y, cone, angle - 0.45, angle + 0.45);
    ctx.closePath();
    ctx.fill();

    // Flash: white halo fading with remaining blindness.
    const blind = blindAmount(dc.round, steamid, dc.tick, dc.meta.tickrate);
    if (blind > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * blind})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body with a direction notch.
    ctx.fillStyle = color;
    ctx.strokeStyle = steamid === dc.selected ? '#ffffff' : COLORS.shadow;
    ctx.lineWidth = steamid === dc.selected ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(angle) * r * 0.35, pos.y + Math.sin(angle) * r * 0.35);
    ctx.lineTo(pos.x + Math.cos(angle) * r * 1.6, pos.y + Math.sin(angle) * r * 1.6);
    ctx.stroke();

    // Health ring.
    const hp = Math.max(0, Math.min(p.hp, 100)) / 100;
    if (hp < 1) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = Math.max(2, r * 0.3);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + ctx.lineWidth, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hp > 0.5 ? '#6bd66b' : hp > 0.2 ? '#f0c040' : '#ff5050';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r + ctx.lineWidth, -Math.PI / 2, -Math.PI / 2 + hp * Math.PI * 2);
      ctx.stroke();
    }

    if (steamid === carrier) drawBombBadge(dc, pos.x + r * 0.9, pos.y - r * 0.9);

    // Name.
    const fontSize = Math.round(Math.max(10, Math.min(13, r * 1.3)));
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.shadow;
    const name = dc.names.get(steamid) ?? '';
    ctx.strokeText(name, pos.x, pos.y + r + 4);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(name, pos.x, pos.y + r + 4);
  }
}

export function drawBombBadge(dc: DrawContext, x: number, y: number) {
  const { ctx } = dc;
  const s = Math.max(6, dc.radius * 0.8);
  ctx.fillStyle = COLORS.bomb;
  ctx.strokeStyle = COLORS.shadow;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - s / 2, y - s / 2, s, s, 2);
  ctx.fill();
  ctx.stroke();
}
