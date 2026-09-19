import type { Frame, PlayerInfo } from '../../types/replay';
import { getDisplayTeam } from '../../config/game';
import { T_TEAM_COLOR, CT_TEAM_COLOR } from './teamStyle';

export interface ProjectileTeamStyle {
  readonly trail: number;
  readonly smoke: number;
  readonly fire: number;
  readonly blast: number;
}

/** Every projectile type on a side shares exactly the same trajectory RGB. */
export const PROJECTILE_TEAM_STYLES: Readonly<Record<number, ProjectileTeamStyle>> = Object.freeze({
  3: Object.freeze({ trail: CT_TEAM_COLOR, smoke: CT_TEAM_COLOR, fire: CT_TEAM_COLOR, blast: CT_TEAM_COLOR }),
  2: Object.freeze({ trail: T_TEAM_COLOR, smoke: T_TEAM_COLOR, fire: T_TEAM_COLOR, blast: T_TEAM_COLOR }),
  0: Object.freeze({ trail: 0x999999, smoke: 0x777777, fire: 0xaaaaaa, blast: 0x777777 }),
});

const KIND_BY_ID: Readonly<Record<number, string>> = {
  501: 'decoy', 502: 'molotov', 503: 'incendiary',
  504: 'flash', 505: 'smoke', 506: 'hegrenade',
};
const ID_BY_KIND: Readonly<Record<string, number>> = {
  decoy: 501, molotov: 502, incendiary: 503, flash: 504, smoke: 505, hegrenade: 506,
};
const ALIASES: Readonly<Record<string, string>> = {
  decoygrenade: 'decoy', molotovgrenade: 'molotov',
  incgrenade: 'incendiary', incendiarygrenade: 'incendiary', inferno: 'incendiary',
  flashbang: 'flash', smokegrenade: 'smoke', he: 'hegrenade',
};

/** Accept parser equipment IDs and legacy weapon/projectile names. */
export function projectileKind(rawType: string | number): string {
  const name = String(rawType).trim().toLowerCase();
  const numeric = KIND_BY_ID[Number(name)];
  if (numeric) return numeric;
  const stripped = name.replace(/^weapon_/, '').replace(/_?projectile$/, '');
  return Object.hasOwn(ALIASES, stripped) ? ALIASES[stripped] : stripped;
}

/** Canonical config key also works for named data such as "flashbang". */
export function projectileTypeId(rawType: string | number): number | undefined {
  const kind = projectileKind(rawType);
  return Object.hasOwn(ID_BY_KIND, kind) ? ID_BY_KIND[kind] : undefined;
}

export function resolveProjectileTeam(throwerID: number, frame: Frame,
  meta?: ReadonlyMap<number, PlayerInfo>): number {
  const originalTeam = meta?.get(throwerID)?.team ?? frame.players[throwerID]?.team ?? 0;
  const team = getDisplayTeam(originalTeam, frame.round);
  return team === 2 || team === 3 ? team : 0;
}

export interface ProjectileEffectDefaults {
  readonly radius: number;
  readonly durationMs: number;
}

// Mirror pkg/engine/entity/projectile.go; TTL is remaining effect time, not age.
// Inferno's actual remaining lifetime still comes from its live server entity.
const EFFECT_DEFAULTS: Readonly<Record<string, ProjectileEffectDefaults>> = Object.freeze({
  decoy: Object.freeze({ radius: 50, durationMs: 15000 }),
  molotov: Object.freeze({ radius: 200, durationMs: 7000 }),
  incendiary: Object.freeze({ radius: 160, durationMs: 7000 }),
  flash: Object.freeze({ radius: 640, durationMs: 500 }),
  smoke: Object.freeze({ radius: 160, durationMs: 20000 }),
  hegrenade: Object.freeze({ radius: 160, durationMs: 3000 }),
});
const UNKNOWN_EFFECT = Object.freeze({ radius: 0, durationMs: 0 });

export function projectileEffectDefaults(kind: string | number): ProjectileEffectDefaults {
  // Unknown equipment has the backend's zero-valued config, not a guessed life.
  const canonical = projectileKind(kind);
  return Object.hasOwn(EFFECT_DEFAULTS, canonical) ? EFFECT_DEFAULTS[canonical] : UNKNOWN_EFFECT;
}
