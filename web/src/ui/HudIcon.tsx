// CS2 HUD icons (Valve assets) mirrored by Juknum/counter-strike-icons, keyed by file name.
const ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob<string>('../assets/hud/*.svg', { eager: true, query: '?url', import: 'default' })).map(
    ([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.svg'.length), url],
  ),
);

export type HudIconName = 'armor' | 'armor_helmet' | 'blind_kill' | 'icon_headshot' | 'inairkill' | 'noscope' | 'penetrate' | 'smoke_kill';

export function HudIcon({ name, title, className }: { name: HudIconName; title: string; className?: string }) {
  return <img className={`hud-icon${className ? ` ${className}` : ''}`} src={ICON_URLS[name]} alt={title} title={title} draggable={false} />;
}
