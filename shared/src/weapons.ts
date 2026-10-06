const DISPLAY_NAMES: Record<string, string> = {
  ak47: 'AK-47',
  aug: 'AUG',
  awp: 'AWP',
  bizon: 'PP-Bizon',
  c4: 'C4',
  planted_c4: 'C4',
  cz75a: 'CZ75-Auto',
  deagle: 'Desert Eagle',
  decoy: 'Decoy',
  elite: 'Dual Berettas',
  famas: 'FAMAS',
  fiveseven: 'Five-SeveN',
  flashbang: 'Flashbang',
  g3sg1: 'G3SG1',
  galilar: 'Galil AR',
  glock: 'Glock-18',
  hegrenade: 'HE Grenade',
  hkp2000: 'P2000',
  incgrenade: 'Incendiary',
  inferno: 'Fire',
  m249: 'M249',
  m4a1: 'M4A4',
  m4a1_silencer: 'M4A1-S',
  m4a1_silencer_off: 'M4A1-S',
  mac10: 'MAC-10',
  mag7: 'MAG-7',
  molotov: 'Molotov',
  mp5sd: 'MP5-SD',
  mp7: 'MP7',
  mp9: 'MP9',
  negev: 'Negev',
  nova: 'Nova',
  p250: 'P250',
  p90: 'P90',
  revolver: 'R8 Revolver',
  sawedoff: 'Sawed-Off',
  scar20: 'SCAR-20',
  sg556: 'SG 553',
  smokegrenade: 'Smoke',
  ssg08: 'SSG 08',
  taser: 'Zeus x27',
  tec9: 'Tec-9',
  ump45: 'UMP-45',
  usp_silencer: 'USP-S',
  usp_silencer_off: 'USP-S',
  xm1014: 'XM1014',
  world: 'World',
};

/** Normalizes event weapon ids ("weapon_ak47", "ak47") to the bare id. */
export function weaponId(raw: string): string {
  return raw.toLowerCase().replace(/^weapon_/, '');
}

export function isKnife(id: string): boolean {
  return id.startsWith('knife') || id === 'bayonet' || id.includes('bayonet');
}

/** Utility and other items that do not fire bullets. */
export function isNonFiring(id: string): boolean {
  return (
    isKnife(id) ||
    ['hegrenade', 'flashbang', 'smokegrenade', 'molotov', 'incgrenade', 'decoy', 'c4', 'taser', 'healthshot'].includes(id)
  );
}

export function weaponDisplayName(raw: string): string {
  const id = weaponId(raw);
  if (DISPLAY_NAMES[id]) return DISPLAY_NAMES[id];
  if (isKnife(id)) return 'Knife';
  return id;
}

/** Grenade names as they appear in the `inventory` prop. */
export const INVENTORY_GRENADES = ['Smoke Grenade', 'Flashbang', 'High Explosive Grenade', 'Molotov', 'Incendiary Grenade', 'Decoy Grenade'];
export const INVENTORY_C4 = 'C4 Explosive';
