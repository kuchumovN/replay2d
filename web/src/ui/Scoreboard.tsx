import { INVENTORY_C4, INVENTORY_GRENADES, mainWeapon, SIDE_CT, SIDE_T, type MatchMeta, type Side } from '@skybox/shared';
import { samplePlayer, slowIndex, type PlayerSample } from '../playback/interp';
import type { PlaybackSnapshot } from '../playback/playback';
import { bombState } from '../playback/state';
import { HudIcon } from './HudIcon';
import { WeaponIcon } from './WeaponIcon';

interface Row {
  steamid: string;
  name: string;
  sample: PlayerSample;
  armor: number;
  helmet: boolean;
  defuser: boolean;
  money: number;
  kills: number;
  deaths: number;
  assists: number;
  weapon: string | null;
  grenades: string[];
  bomb: boolean;
}

interface Props {
  snap: PlaybackSnapshot;
  meta: MatchMeta;
  names: Map<string, string>;
  onSelect: (steamid: string) => void;
}

export function Scoreboard({ snap, meta, names, onSelect }: Props) {
  const round = snap.round;
  const roundMeta = meta.rounds[snap.roundIndex];
  const rows: Row[] = [];
  if (round) {
    const si = slowIndex(round, snap.tick);
    const bomb = bombState(round, snap.tick, meta.tickrate);
    const c4 = round.strings.indexOf(INVENTORY_C4);
    round.players.forEach((p, i) => {
      const sample = samplePlayer(round, i, snap.tick);
      if (!sample) return;
      const slow = round.slow.find((s) => s.steamid === p.steamid);
      const inventory = slow?.inventory[si] ?? [];
      const items = sample.alive ? inventory.map((s) => round.strings[s]) : [];
      rows.push({
        steamid: p.steamid,
        name: names.get(p.steamid) ?? p.steamid,
        sample,
        armor: sample.alive ? (slow?.armor[si] ?? 0) : 0,
        helmet: !!slow?.helmet[si],
        defuser: !!slow?.defuser[si],
        money: slow?.money[si] ?? 0,
        kills: slow?.kills[si] ?? 0,
        deaths: slow?.deaths[si] ?? 0,
        assists: slow?.assists[si] ?? 0,
        weapon: mainWeapon(items),
        grenades: items.filter((s) => INVENTORY_GRENADES.includes(s)),
        bomb: bomb?.kind === 'carried' ? bomb.player === p.steamid : sample.alive && inventory.includes(c4) && bomb === null,
      });
    });
  }

  const side = (s: Side) =>
    rows
      .filter((r) => r.sample.side === s)
      .sort((a, b) => Number(b.sample.alive) - Number(a.sample.alive) || b.kills - a.kills || a.name.localeCompare(b.name));

  return (
    <aside className="scoreboard">
      <TeamTable title={roundMeta.ctName} cls="ct" rows={side(SIDE_CT)} selected={snap.selected} onSelect={onSelect} />
      <TeamTable title={roundMeta.tName} cls="t" rows={side(SIDE_T)} selected={snap.selected} onSelect={onSelect} />
    </aside>
  );
}

function TeamTable({ title, cls, rows, selected, onSelect }: { title: string; cls: string; rows: Row[]; selected: string | null; onSelect: (id: string) => void }) {
  const alive = rows.filter((r) => r.sample.alive).length;
  return (
    <section className={`team-table ${cls}`}>
      <div className="team-header">
        <span>{title}</span>
        <span className="muted">
          {alive}/{rows.length} alive · K / D / A
        </span>
      </div>
      {rows.map((r) => (
        <div
          key={r.steamid}
          className={`player-row${r.sample.alive ? '' : ' dead'}${selected === r.steamid ? ' selected' : ''}`}
          onClick={() => onSelect(r.steamid)}
          title="Click to highlight on the radar"
        >
          <div className="hp-bar">
            <div style={{ width: `${r.sample.alive ? r.sample.hp : 0}%` }} />
            <span>
              {r.sample.alive ? r.sample.hp : ''}
              {r.armor > 0 && <HudIcon name={r.helmet ? 'armor_helmet' : 'armor'} title={`Armor ${r.armor}${r.helmet ? ' + helmet' : ''}`} />}
            </span>
          </div>
          <div className="player-main">
            <div className="player-line">
              <span className="player-name">{r.name}</span>
              <span className="kda">
                {r.kills} / {r.deaths} / {r.assists}
              </span>
            </div>
            <div className="player-line small">
              <span className="weapon-name">{!r.sample.alive ? 'dead' : r.weapon && <WeaponIcon name={r.weapon} />}</span>
              <span className="icons">
                {r.grenades.map((g, i) => (
                  <WeaponIcon key={i} name={g} className="nade" />
                ))}
                {r.defuser && <span className="badge kit" title="Defuse kit">KIT</span>}
                {r.bomb && <span className="badge c4" title="Bomb">C4</span>}
                <span className="money">${r.money}</span>
              </span>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
