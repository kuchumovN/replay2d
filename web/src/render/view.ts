import type { MapInfo } from '@replay2d/shared';
import { levelIndex, RADAR_SIZE, worldToRadar } from '../map/transform';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const GAP = 12;

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/**
 * Lays out one square viewport per map level (side by side or stacked, whichever is larger) and
 * applies a shared zoom/pan to all of them.
 */
export class View {
  zoom = 1;
  panX = 0;
  panY = 0;
  rects: Rect[] = [];
  /** Area each level is clipped to: the whole canvas for single-level maps, so zooming uses all of it. */
  clips: { x: number; y: number; w: number; h: number }[] = [];

  constructor(public map: MapInfo) {}

  layout(width: number, height: number) {
    const n = this.map.levels.length;
    const sideBySide = Math.min(height, (width - GAP * (n - 1)) / n);
    const stacked = Math.min(width, (height - GAP * (n - 1)) / n);
    const horizontal = sideBySide >= stacked;
    const size = Math.max(0, Math.floor(horizontal ? sideBySide : stacked));
    const totalW = horizontal ? size * n + GAP * (n - 1) : size;
    const totalH = horizontal ? size : size * n + GAP * (n - 1);
    const x0 = (width - totalW) / 2;
    const y0 = (height - totalH) / 2;
    this.rects = this.map.levels.map((_, i) => ({
      x: horizontal ? x0 + i * (size + GAP) : x0,
      y: horizontal ? y0 : y0 + i * (size + GAP),
      size,
    }));
    this.clips =
      n === 1 ? [{ x: 0, y: 0, w: width, h: height }] : this.rects.map((r) => ({ x: r.x, y: r.y, w: r.size, h: r.size }));
  }

  /** Screen pixels per radar pixel. */
  get unit() {
    return ((this.rects[0]?.size ?? 0) / RADAR_SIZE) * this.zoom;
  }

  radarToScreen(level: number, rx: number, ry: number): { x: number; y: number } {
    const r = this.rects[level] ?? this.rects[0];
    const k = r.size / RADAR_SIZE;
    return {
      x: r.x + r.size / 2 + (rx * k - r.size / 2) * this.zoom + this.panX,
      y: r.y + r.size / 2 + (ry * k - r.size / 2) * this.zoom + this.panY,
    };
  }

  /** World position → screen position on the level matching its height. */
  project(x: number, y: number, z: number | null): { x: number; y: number; level: number } {
    const level = levelIndex(this.map, z);
    const r = worldToRadar(this.map, x, y);
    return { ...this.radarToScreen(level, r.x, r.y), level };
  }

  levelAt(sx: number, sy: number): number {
    return this.rects.findIndex((r) => sx >= r.x && sx <= r.x + r.size && sy >= r.y && sy <= r.y + r.size);
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const level = Math.max(0, this.levelAt(sx, sy));
    const r = this.rects[level];
    if (!r) return;
    const next = Math.min(Math.max(this.zoom * factor, MIN_ZOOM), MAX_ZOOM);
    // Keep the point under the cursor fixed.
    const cx = r.x + r.size / 2;
    const cy = r.y + r.size / 2;
    const ux = (sx - cx - this.panX) / this.zoom;
    const uy = (sy - cy - this.panY) / this.zoom;
    this.zoom = next;
    this.panX = sx - cx - ux * next;
    this.panY = sy - cy - uy * next;
    this.clampPan();
  }

  pan(dx: number, dy: number) {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
  }

  reset() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  /** Keeps the zoomed radar covering its viewport. */
  private clampPan() {
    const size = this.rects[0]?.size ?? 0;
    const limit = (size * (this.zoom - 1)) / 2;
    this.panX = Math.min(Math.max(this.panX, -limit), limit);
    this.panY = Math.min(Math.max(this.panY, -limit), limit);
  }
}
