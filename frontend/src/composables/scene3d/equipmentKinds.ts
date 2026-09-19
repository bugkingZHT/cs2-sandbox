import { EQUIPMENT_ID_MAP } from '../../config/equipment';
import { projectileKind } from './projectileStyle';

export const EQUIPMENT_KINDS = ['sniper', 'rifle', 'smg', 'shotgun', 'machinegun', 'pistol', 'knife',
  'smoke', 'flash', 'hegrenade', 'molotov', 'incendiary', 'decoy', 'c4'] as const;
export type EquipmentKind = typeof EQUIPMENT_KINDS[number];

/** Standard-scale muzzle distance from the actor; shared by models and shot effects. */
export function weaponMuzzleOffset(kind?: EquipmentKind): number {
  return kind === 'sniper' ? 76 : 48;
}

const categories: Record<string, EquipmentKind> = {};
for (const [kind, names] of Object.entries({
  sniper: 'awp ssg08 scout scar20 g3sg1',
  rifle: 'ak47 m4a4 m4a1 m4a1_silencer galil galilar famas aug sg553 sg556',
  smg: 'mac10 mp9 mp7 mp5 mp5sd ump ump45 p90 bizon',
  shotgun: 'nova xm1014 mag7 swag7 sawedoff',
  machinegun: 'm249 negev',
  pistol: 'hkp2000 p2000 glock glock18 p250 deagle fiveseven elite dualberettas tec9 cz cz75a usp usp_silencer revolver zeus taser',
  knife: 'knife knife_t bayonet',
  c4: 'c4 bomb',
})) for (const name of names.split(' ')) categories[name] = kind as EquipmentKind;

/** EquipmentType IDs from the replay parser, never CS item-definition indices. */
export function equipmentKind(raw: string | number | undefined): EquipmentKind | undefined {
  if (raw === undefined || raw === '') return undefined;
  const name = String(raw).trim().toLowerCase().replace(/^weapon_/, '');
  const canonical = /^\d+$/.test(name) ? EQUIPMENT_ID_MAP[Number(name)] : name;
  if (!canonical) return undefined;
  if (Object.hasOwn(categories, canonical)) return categories[canonical];
  if (canonical.startsWith('knife_')) return 'knife';
  const utility = projectileKind(canonical);
  return (EQUIPMENT_KINDS as readonly string[]).includes(utility) ? utility as EquipmentKind : undefined;
}

export function isHandheldUtility(kind: EquipmentKind): boolean {
  return ['smoke', 'flash', 'hegrenade', 'molotov', 'incendiary', 'decoy', 'c4'].includes(kind);
}
