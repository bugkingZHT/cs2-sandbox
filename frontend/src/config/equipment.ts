/**
 * 武器和道具 ID 到素材文件名的映射表
 * 这里的 key 对应 demoinfocs-golang 中 common.EquipmentType 的值
 * value 对应 public/weapons 或 public/utility 下的文件名（不带后缀）
 */
export const EQUIPMENT_ID_MAP: Record<number, string> = {
  // Pistols (1-99)
  1: 'hkp2000',      // EqP2000
  2: 'glock',        // EqGlock
  3: 'p250',         // EqP250
  4: 'deagle',       // EqDeagle
  5: 'fiveseven',    // EqFiveSeven
  6: 'elite',        // EqDualBerettas
  7: 'tec9',         // EqTec9
  8: 'tec9',         // EqCZ (fallback to tec9)
  9: 'usp_silencer', // EqUSP
  10: 'hkp2000',     // EqRevolver (fallback to p2000)

  // Heavy (200-299)
  // SMGs
  201: 'mac10',      // EqMac10
  202: 'mp9',        // EqMP9
  203: 'mp9',        // EqMP7 (fallback to mp9)
  204: 'mp9',        // EqMP5 (fallback to mp9)
  205: 'mac10',      // EqUMP (fallback to mac10)
  206: 'mac10',      // EqP90 (fallback to mac10)
  207: 'mac10',      // EqBizon (fallback to mac10)

  // Shotguns
  
  // Rifles (300-399)
  301: 'galilar',    // EqGalil
  302: 'famas',      // EqFamas
  303: 'ak47',       // EqAK47
  304: 'm4a4',       // EqM4A4
  305: 'm4a1_silencer', // EqM4A1
  306: 'ssg08',      // EqScout / SSG08
  307: 'ak47',       // EqSG556 (fallback to ak47)
  308: 'famas',      // EqAUG (fallback to famas)
  309: 'awp',        // EqAWP
  310: 'awp',        // EqG3SG1 (fallback to awp)
  311: 'awp',        // EqScar20 (fallback to awp)

  // Equipment
  404: 'c4',         // EqBomb (在 utility 目录下)
  405: 'knife',      // EqKnife (在 weapons 目录下)

  // Grenades (在 utility 目录下)
  501: 'decoy',      // EqDecoy
  502: 'molotov',    // EqMolotov
  503: 'incendiary', // EqIncendiary
  504: 'flash',      // EqFlash
  505: 'smoke',      // EqSmoke
  506: 'hegrenade',  // EqHE
  
  // Legacy IDs (older demo formats)
  102: 'mp9',        // Legacy SMG
  104: 'mac10',      // Legacy SMG
};

/**
 * 判断是否属于投掷物、C4或刀（这些素材在 utility 目录下，且攻击时不显示红线）
 */
export const isUtilityItem = (id: number): boolean => {
  return (id >= 501 && id <= 506) || id === 404 || id === 405;
};
