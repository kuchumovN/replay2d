import { SIDE_CT, type RoundData } from '@replay2d/shared';
import { samplePlayer } from '../playback/interp';
import { killsUntil } from '../playback/state';
import { HudIcon } from './HudIcon';
import { WeaponIcon } from './WeaponIcon';

const MAX_KILLS = 5;
/** Kills older than this (in ticks at 64 tick) are dimmed. */
const FRESH_TICKS = 64 * 8;

export function KillFeed({ round, tick, names }: { round: RoundData; tick: number; names: Map<string, string> }) {
  const kills = killsUntil(round, tick).slice(-MAX_KILLS);
  if (kills.length === 0) return null;

  // Side at the moment of the kill.
  const sideOf = (steamid: string | null, at: number) => {
    const i = round.players.findIndex((p) => p.steamid === steamid);
    return i < 0 ? null : samplePlayer(round, i, at)?.side === SIDE_CT ? 'ct' : 't';
  };

  return (
    <div className="killfeed">
      {kills.map((k, i) => (
        <div key={`${k.tick}-${k.victim}-${i}`} className={`kill${tick - k.tick > FRESH_TICKS ? ' old' : ''}`}>
          {k.attacker && k.attacker !== k.victim && (
            <span className={sideOf(k.attacker, k.tick) ?? ''}>{names.get(k.attacker) ?? '?'}</span>
          )}
          {k.assister && (
            <span className={`assist ${sideOf(k.assister, k.tick) ?? ''}`}>
              + {k.assistedFlash ? '⚡' : ''}
              {names.get(k.assister) ?? '?'}
            </span>
          )}
          <span className="weapon">
            {k.attackerBlind && <HudIcon name="blind_kill" title="Attacker was blind" />}
            {k.attackerInAir && <HudIcon name="inairkill" title="Attacker was in the air" />}
            <WeaponIcon name={k.weapon} />
            {k.noScope && <HudIcon name="noscope" title="No scope" />}
            {k.throughSmoke && <HudIcon name="smoke_kill" title="Through smoke" />}
            {k.wallbang && <HudIcon name="penetrate" title="Wallbang" />}
            {k.headshot && <HudIcon name="icon_headshot" title="Headshot" />}
          </span>
          <span className={sideOf(k.victim, k.tick) ?? ''}>{names.get(k.victim) ?? '?'}</span>
        </div>
      ))}
    </div>
  );
}
