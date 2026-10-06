import { COLORS, type DrawContext } from './context';

function progressRing(dc: DrawContext, x: number, y: number, radius: number, fraction: number, color: string) {
  const { ctx } = dc;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.min(1, fraction) * Math.PI * 2);
  ctx.stroke();
}

function bombIcon(dc: DrawContext, x: number, y: number, color: string) {
  const { ctx } = dc;
  const s = Math.max(10, dc.radius * 1.4);
  ctx.fillStyle = color;
  ctx.strokeStyle = COLORS.shadow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - s / 2, y - s / 2, s, s, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(s * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('C4', x, y + 0.5);
}

export function drawBomb(dc: DrawContext) {
  const bomb = dc.bomb;
  if (!bomb) return;
  const { view, tick, meta, radius } = dc;

  if (bomb.kind === 'carried') {
    const p = dc.players.get(bomb.player);
    if (p && bomb.planting) {
      const pos = view.project(p.x, p.y, p.z);
      const fraction = (tick - bomb.planting.startTick) / (bomb.planting.endTick - bomb.planting.startTick);
      progressRing(dc, pos.x, pos.y, radius * 2.2, fraction, COLORS.bomb);
    }
    return;
  }

  const pos = view.project(bomb.pos.x, bomb.pos.y, bomb.pos.z);
  if (bomb.kind === 'dropped') {
    bombIcon(dc, pos.x, pos.y, COLORS.bomb);
  } else if (bomb.kind === 'planted') {
    // Beeps faster as the timer runs down.
    const left = meta.c4Timer - (tick - bomb.plantTick) / meta.tickrate;
    const period = left > 10 ? 1 : left > 5 ? 0.5 : 0.25;
    const phase = ((tick / meta.tickrate) % period) / period;
    const ring = radius * (1.4 + phase * 2.2);
    dc.ctx.strokeStyle = `rgba(255, 75, 75, ${1 - phase})`;
    dc.ctx.lineWidth = 2;
    dc.ctx.beginPath();
    dc.ctx.arc(pos.x, pos.y, ring, 0, Math.PI * 2);
    dc.ctx.stroke();
    bombIcon(dc, pos.x, pos.y, COLORS.bomb);
    if (bomb.defuse) {
      const fraction = (tick - bomb.defuse.startTick) / (bomb.defuse.endTick - bomb.defuse.startTick);
      progressRing(dc, pos.x, pos.y, radius * 2.2, fraction, COLORS.ct);
    }
  } else if (bomb.kind === 'defused') {
    bombIcon(dc, pos.x, pos.y, COLORS.ct);
  } else {
    const t = (tick - bomb.tick) / (meta.tickrate * 1.5);
    if (t < 1) {
      dc.ctx.globalAlpha = 1 - t;
      dc.ctx.fillStyle = 'rgba(255, 120, 40, 0.75)';
      dc.ctx.beginPath();
      dc.ctx.arc(pos.x, pos.y, radius * (2 + t * 14), 0, Math.PI * 2);
      dc.ctx.fill();
      dc.ctx.globalAlpha = 1;
    }
    bombIcon(dc, pos.x, pos.y, '#555');
  }
}
