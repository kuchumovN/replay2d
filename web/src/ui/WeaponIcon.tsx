import { isKnife, itemWeaponId, weaponDisplayName, weaponId } from '@skybox/shared';

// Icons from lexogrine/cs2-react-hud (MIT, see assets/weapons/LICENSE), keyed by weapon id.
const ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/weapons/*.svg', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url],
  ),
);

/**
 * Weapon/grenade icon; falls back to text for items without an icon.
 * `name` is an item name ("AK-47", "Smoke Grenade") or an event weapon id ("ak47", "inferno").
 */
export function WeaponIcon({ name, className }: { name: string; className?: string }) {
  const id = itemWeaponId(name);
  const url = ICON_URLS[id] ?? (isKnife(id) ? ICON_URLS.knife : undefined);
  // Item names are already human-readable; event ids are not.
  const label = id === weaponId(name) ? weaponDisplayName(name) : name;
  if (!url) return <span className={className}>{label}</span>;
  return <img className={`weapon-icon${className ? ` ${className}` : ''}`} src={url} alt={label} title={label} draggable={false} />;
}
