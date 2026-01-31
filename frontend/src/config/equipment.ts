/**
 * 武器和道具 ID 到素材文件名的映射表
 * 这里的 key 对应 types.go 中定义的 EquipmentType
 * value 对应 public/weapons 或 public/utility 下的文件名（不带后缀）
 */
export const EQUIPMENT_ID_MAP: Record<number, string> = {
  // Pistols
  1: 'hkp2000',      // EqP2000
  2: 'glock',        // EqGlock
  3: 'p250',         // EqP250
  4: 'deagle',       // EqDeagle
  5: 'fiveseven',    // EqFiveSeven
  6: 'elite',        // EqDualBerettas (映射到 elite)
  7: 'tec9',         // EqTec9
  9: 'usp_silencer', // EqUSP

  // SMGs
  102: 'mp9',        // EqMP9
  104: 'mac10',      // EqMac10

  // Rifles
  301: 'galilar',    // EqGalil
  302: 'famas',      // EqFamas
  303: 'ak47',       // EqAK47
  304: 'm4a4',       // EqM4A4
  305: 'm4a1_silencer', // EqM4A1
  306: 'ssg08',      // EqSSG08

  // Snipers
  309: 'awp',        // EqAWP

  // Equipment
  404: 'c4',         // EqBomb (在 utility 目录下)
  405: 'knife',      // EqKnife (在 utility 目录下)

  // Grenades (在 utility 目录下)
  501: 'decoy',      // EqDecoy
  502: 'molotov',    // EqMolotov
  503: 'incendiary', // EqIncendiary
  504: 'flash',      // EqFlash
  505: 'smoke',      // EqSmoke
  506: 'hegrenade',  // EqHE
};

/**
 * 判断是否属于投掷物、C4或刀（这些素材在 utility 目录下，且攻击时不显示红线）
 */
export const isUtilityItem = (id: number): boolean => {
  return (id >= 501 && id <= 506) || id === 404 || id === 405;
};
