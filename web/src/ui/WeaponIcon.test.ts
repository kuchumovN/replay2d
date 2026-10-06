import { INVENTORY_C4, INVENTORY_GRENADES, itemWeaponId } from '@skybox/shared';
import { describe, expect, it } from 'vitest';

const icons = new Set(Object.keys(import.meta.glob('../assets/weapons/*.svg')).map((p) => p.slice(p.lastIndexOf('/') + 1, -'.svg'.length)));

describe('weapon icons', () => {
  it('maps item names and event ids to the same weapon id', () => {
    expect(itemWeaponId('AK-47')).toBe('ak47');
    expect(itemWeaponId('weapon_ak47')).toBe('ak47');
    expect(itemWeaponId('M4A4')).toBe('m4a1');
    expect(itemWeaponId('Huntsman Knife')).toBe('knife_tactical');
    expect(itemWeaponId('inferno')).toBe('inferno');
  });

  it('has an icon for every grenade, C4 and common weapon', () => {
    const names = [...INVENTORY_GRENADES, INVENTORY_C4, 'AK-47', 'M4A1-S', 'USP-S', 'Glock-18', 'AWP', 'Desert Eagle', 'Zeus x27', 'knife_t'];
    for (const name of names) expect(icons.has(itemWeaponId(name)), name).toBe(true);
  });
});
