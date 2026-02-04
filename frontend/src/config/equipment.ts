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
  8: 'cz',           // EqCZ
  9: 'usp_silencer', // EqUSP
  10: 'revolver',    // EqRevolver

  // Heavy (200-299)
  // SMGs
  201: 'mac10',      // EqMac10
  202: 'mp9',        // EqMP9
  203: 'mp7',        // EqMP7
  204: 'mp5',        // EqMP5
  205: 'ump',        // EqUMP
  206: 'p90',        // EqP90
  207: 'bizon',      // EqBizon

  // Shotguns
  211: 'nova',       // EqNova
  212: 'xm1014',     // EqXM1014
  213: 'mag7',       // EqMag7
  214: 'sawedoff',   // EqSawedOff
  
  // Machine Guns
  221: 'm249',       // EqM249
  222: 'negev',      // EqNegev
  
  // Rifles (300-399)
  301: 'galilar',    // EqGalil
  302: 'famas',      // EqFamas
  303: 'ak47',       // EqAK47
  304: 'm4a4',       // EqM4A4
  305: 'm4a1_silencer', // EqM4A1
  306: 'ssg08',      // EqScout / SSG08
  307: 'sg556',      // EqSG556
  308: 'aug',        // EqAUG
  309: 'awp',        // EqAWP
  310: 'g3sg1',      // EqG3SG1
  311: 'scar20',     // EqScar20

  // Equipment
  404: 'c4',         // EqBomb (在 utility 目录下)
  405: 'knife',      // EqKnife (在 weapons 目录下)
  406: 'zeus',       // EqZeus (电击枪)

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
