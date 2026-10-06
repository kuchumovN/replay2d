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

/** Item names from `active_weapon_name` / `inventory` (demoparser2 WEAPINDICIES) → weapon id. */
const ITEM_NAME_IDS: Record<string, string> = {
  'Desert Eagle': 'deagle',
  'Dual Berettas': 'elite',
  'Five-SeveN': 'fiveseven',
  'Glock-18': 'glock',
  'AK-47': 'ak47',
  AUG: 'aug',
  AWP: 'awp',
  FAMAS: 'famas',
  G3SG1: 'g3sg1',
  'Galil AR': 'galilar',
  M249: 'm249',
  M4A4: 'm4a1',
  'MAC-10': 'mac10',
  P90: 'p90',
  'MP5-SD': 'mp5sd',
  'UMP-45': 'ump45',
  XM1014: 'xm1014',
  'PP-Bizon': 'bizon',
  'MAG-7': 'mag7',
  Negev: 'negev',
  'Sawed-Off': 'sawedoff',
  'Tec-9': 'tec9',
  'Zeus x27': 'taser',
  P2000: 'hkp2000',
  MP7: 'mp7',
  MP9: 'mp9',
  Nova: 'nova',
  P250: 'p250',
  'SCAR-20': 'scar20',
  'SG 553': 'sg556',
  'SSG 08': 'ssg08',
  Knife: 'knife',
  Flashbang: 'flashbang',
  'High Explosive Grenade': 'hegrenade',
  'Smoke Grenade': 'smokegrenade',
  Molotov: 'molotov',
  'Decoy Grenade': 'decoy',
  'Incendiary Grenade': 'incgrenade',
  'C4 Explosive': 'c4',
  'Medi-Shot': 'healthshot',
  'M4A1-S': 'm4a1_silencer',
  'USP-S': 'usp_silencer',
  'CZ75-Auto': 'cz75a',
  'R8 Revolver': 'revolver',
  Bayonet: 'bayonet',
  'Classic Knife': 'knife_css',
  'Flip Knife': 'knife_flip',
  'Gut Knife': 'knife_gut',
  Karambit: 'knife_karambit',
  'M9 Bayonet': 'knife_m9_bayonet',
  'Huntsman Knife': 'knife_tactical',
  'Falchion Knife': 'knife_falchion',
  'Bowie Knife': 'knife_survival_bowie',
  'Butterfly Knife': 'knife_butterfly',
  'Shadow Daggers': 'knife_push',
  'Paracord Knife': 'knife_cord',
  'Survival Knife': 'knife_canis',
  'Ursus Knife': 'knife_ursus',
  'Navaja Knife': 'knife_gypsy_jackknife',
  'Nomad Knife': 'knife_outdoor',
  'Stiletto Knife': 'knife_stiletto',
  'Talon Knife': 'knife_widowmaker',
  'Skeleton Knife': 'knife_skeleton',
  'Kukri Knife': 'knife_kukri',
};

/** Weapon id from either an item name ("AK-47", "Smoke Grenade") or an event id ("weapon_ak47", "ak47"). */
export function itemWeaponId(nameOrId: string): string {
  return ITEM_NAME_IDS[nameOrId] ?? weaponId(nameOrId);
}

/** Grenade names as they appear in the `inventory` prop. */
export const INVENTORY_GRENADES = ['Smoke Grenade', 'Flashbang', 'High Explosive Grenade', 'Molotov', 'Incendiary Grenade', 'Decoy Grenade'];
export const INVENTORY_C4 = 'C4 Explosive';
