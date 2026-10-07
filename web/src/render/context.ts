import { SIDE_CT, type MapInfo, type MatchMeta, type RoundData, type Side } from '@replay2d/shared';
import type { PlayerSample } from '../playback/interp';
import type { BombState } from '../playback/state';
import type { View } from './view';

export const COLORS = {
  ct: '#5aa9e6',
  t: '#eab64a',
  ctDim: 'rgba(90, 169, 230, 0.45)',
  tDim: 'rgba(234, 182, 74, 0.45)',
  bomb: '#ff4b4b',
  text: '#f2f4f7',
  shadow: 'rgba(0, 0, 0, 0.85)',
};

export const sideColor = (side: Side | null | undefined, dim = false) =>
  side === SIDE_CT ? (dim ? COLORS.ctDim : COLORS.ct) : dim ? COLORS.tDim : COLORS.t;

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  view: View;
  map: MapInfo;
  meta: MatchMeta;
  round: RoundData;
  tick: number;
  speed: number;
  selected: string | null;
  names: Map<string, string>;
  /** Interpolated player states for this frame, keyed by steamid. */
  players: Map<string, PlayerSample>;
  bomb: BombState | null;
  /** Base marker radius in screen pixels. */
  radius: number;
}
