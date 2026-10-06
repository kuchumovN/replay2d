import type { MapInfo } from '@skybox/shared';
import { useEffect, useRef } from 'react';
import { View } from '../render/view';

export type RadarDraw = (ctx: CanvasRenderingContext2D, width: number, height: number, view: View) => void;

/**
 * Canvas over a map radar: keeps it sized to its element, redraws every animation frame with the latest
 * `draw`, and handles scroll zoom, drag pan and double-click reset.
 */
export function useRadarCanvas(map: MapInfo, draw: RadarDraw) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const view = new View(map);
    let width = 0;
    let height = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const loop = () => {
      drawRef.current(ctx, width, height, view);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const local = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    };
    let drag: { x: number; y: number } | null = null;
    const onDown = (e: MouseEvent) => {
      drag = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      view.pan(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      drag = null;
    };
    const onDouble = () => view.reset();

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('dblclick', onDouble);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('dblclick', onDouble);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [map]);

  return canvasRef;
}
