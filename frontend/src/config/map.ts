/** 底图默认像素尺寸（SVG 纹理），与 xRange/yRange 配合做比例坐标换算 */
export const MAP_IMAGE_SIZE = 2048;
/** 逻辑地图尺寸（与 config width/height 一致）；SVG 为 2x 故 MAP_IMAGE_SIZE = 2 * LOGICAL_MAP_SIZE，zoom 按逻辑尺寸计算 */
export const LOGICAL_MAP_SIZE = 1024;

/**
 * Canvas 地图上所有展示元素的尺寸配置
 * 可根据需要单独调整各元素大小
 */
export const MAP_CANVAS_ELEMENT_SIZES = {
  /** 玩家相关 */
  player: {
    /** 存活玩家圆圈半径 */
    aliveRadius: 10,
    /** 死亡玩家圆圈半径（死亡标识） */
    deadRadius: 7.5,
    /** 玩家名字字体大小 */
    nameSize: 24,
    /** 方向指示三角 */
    directionTriangle: {
      length: 8,
      width: 6,
    },
    /** 开火线长度系数（实际绘制会乘 8） */
    attackLineLength: 60,
    /** 手持道具/C4 图标尺寸（玩家身上的 grenade、C4 等） */
    weaponIconSize: 15,
    /** 死亡叉相对圆圈半径的比例 */
    deathCrossScale: 0.7,
    /** 致盲状态外圈偏移量 */
    blindEffectOffset: 4.5,
    /** 名字与圆圈的垂直偏移 */
    labelOffset: 4,
  },
  /** 投掷物/道具相关 */
  projectile: {
    /** 飞行中投掷物图标基准尺寸 */
    iconBaseSize: 30,
    /** 掉落道具图标基准尺寸 */
    droppedIconBaseSize: 30,
    /** 掉落道具图标缩放系数 */
    droppedIconScale: 0.85,
    /** 轨迹碰撞点圆圈半径 */
    trajectoryPointRadius: 3,
    /** 轨迹线条宽度 */
    trajectoryLineWidth: 3,
    /** 闪光弹爆炸中心点半径 */
    flashExplosionCenter: 3.75,
    /** 诱饵弹爆炸显示半径 */
    decoyExplosionRadius: 6,
    /** 诱饵弹爆炸外圈半径 */
    decoyExplosionStrokeRadius: 12,
    /** 高爆手雷爆炸中心点半径 */
    heExplosionCenter: 4.5,
  },
  /** C4 炸弹相关 */
  bomb: {
    /** C4 图标尺寸 */
    iconSize: 36,
    /** 倒计时环半径 */
    ringRadius: 27,
    /** 爆炸后中心爆点基准半径 */
    explosionCoreBase: 60,
    /** 爆炸后中心爆点脉冲增量 */
    explosionCorePulse: 30,
  },
} as const;

/**
 * SVG 作为纹理加载时的栅格化分辨率倍数（Pixi Assets.load data.resolution）。
 * 越大放大越清晰，纹理尺寸与显存占用也越高（单纹理最大 4096×4096）。
 * @default 4
 */
export const SVG_TEXTURE_RESOLUTION = 4;

export interface MapConfig {
  name: string;
  /** 底图路径，支持 SVG / PNG */
  mapUrl: string;
  leftSideGroundMap?: string; // 左侧卡片背景图
  width: number;
  height: number;
  xRange: {
    start: number;
    end: number;
  };
  yRange: {
    start: number;
    end: number;
  };
  /** 双层地图配置：主图左、辅图右，按 z 轴阈值分派实体 */
  dualLayer?: {
    zLayerThreshold: number; // z > threshold 显示主图，否则辅图
    /** 主辅图重叠像素数，辅图向左偏移。0=完全并列，mapSize/2=一半重叠 */
    offset?: number;
    /** 辅图路径，未配置时默认为 ${mapName}_2.svg */
    mapUrl2?: string;
  };
  /** 辅图 x 范围，未配置时与主图 xRange 相同 */
  xRange2?: { start: number; end: number };
  /** 辅图 y 范围，未配置时与主图 yRange 相同 */
  yRange2?: { start: number; end: number };
}

/** 获取辅图 URL（双层地图），优先用 config.dualLayer.mapUrl2，否则按 name_2.svg 推导 */
export function getSecondaryMapUrl(config: MapConfig): string {
  if (config.dualLayer?.mapUrl2) return config.dualLayer.mapUrl2;
  const base = config.mapUrl.replace(/\.svg$/, '');
  return `${base}_2.svg`;
}

/** 判断是否为双层地图 */
export function isDualLayerMap(config: MapConfig): boolean {
  return !!(config.dualLayer && config.dualLayer.zLayerThreshold !== undefined);
}

/**
 * 各地图是否支持解析；仅支持解析为 true 的地图 demo，上传其他地图将导致解析失败。
 */
export const MAP_PARSING_SUPPORT: Record<string, boolean> = {
  'ar_baggage': false,
  'ar_shoots': false,
  'ar_shoots_night': false,
  'cs_italy': false,
  'cs_office': false,
  'de_ancient': true,
  'de_ancient_night': false,
  'de_ancient_v1': false,
  'de_ancient_v2': false,
  'de_anubis': true,
  'de_cache': true,
  'de_dust': false,
  'de_dust2': true,
  'de_inferno': true,
  'de_mirage': true,
  'de_nuke': true,
  'de_overpass': true,
  'de_train': false,
  'de_vertigo': false,
  'workshop_preview': false,
};

/** 支持解析的地图名称列表（用于提示文案） */
export const SUPPORTED_PARSING_MAP_NAMES = (
  Object.entries(MAP_PARSING_SUPPORT)
    .filter(([, supported]) => supported)
    .map(([name]) => name)
    .sort()
) as readonly string[];

export const MAP_CONFIGS: Record<string, MapConfig> = {
  'ar_baggage': {
    name: 'ar_baggage',
    mapUrl: '/map/ar_baggage.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -1316,
      end: 1284
    },
    yRange: {
      start: -1312,
      end: 1288
    }
  },
  'ar_shoots': {
    name: 'ar_shoots',
    mapUrl: '/map/ar_shoots.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -1368,
      end: 1384
    },
    yRange: {
      start: -800,
      end: 1952
    }
  },
  'ar_shoots_night': {
    name: 'ar_shoots_night',
    mapUrl: '/map/ar_shoots_night.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -1368,
      end: 1384
    },
    yRange: {
      start: -800,
      end: 1952
    }
  },
  'cs_italy': {
    name: 'cs_italy',
    mapUrl: '/map/cs_italy.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2647,
      end: 2063.4
    },
    yRange: {
      start: -2118.4,
      end: 2592
    }
  },
  'cs_office': {
    name: 'cs_office',
    mapUrl: '/map/cs_office.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -1838,
      end: 2360.4
    },
    yRange: {
      start: -2340.4,
      end: 1858
    }
  },
  'de_ancient': {
    name: 'de_ancient',
    mapUrl: '/map/de_ancient.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_ancient_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2953,
      end: 2167
    },
    yRange: {
      start: -2956,
      end: 2164
    }
  },
  'de_ancient_night': {
    name: 'de_ancient_night',
    mapUrl: '/map/de_ancient_night.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2953,
      end: 2167
    },
    yRange: {
      start: -2956,
      end: 2164
    }
  },
  'de_ancient_v1': {
    name: 'de_ancient_v1',
    mapUrl: '/map/de_ancient_v1.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2953,
      end: 2167
    },
    yRange: {
      start: -2956,
      end: 2164
    }
  },
  'de_ancient_v2': {
    name: 'de_ancient_v2',
    mapUrl: '/map/de_ancient_v2.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2953,
      end: 2167
    },
    yRange: {
      start: -2956,
      end: 2164
    }
  },
  'de_anubis': {
    name: 'de_anubis',
    mapUrl: '/map/de_anubis.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_anubis_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2796,
      end: 2549.28
    },
    yRange: {
      start: -2017.28,
      end: 3328
    }
  },
  // 雷达坐标来源：SteamDatabase/GameTracking-CS2 的
  // game/csgo/pak01_dir/resource/overviews/de_cache.txt（pos_x=-2000, pos_y=3250, scale=5.5）。
  'de_cache': {
    name: 'de_cache',
    mapUrl: '/map/de_cache.png',
    width: 1024,
    height: 1024,
    xRange: { start: -2000, end: 3632 },
    yRange: { start: -2382, end: 3250 },
  },
  'de_dust': {
    name: 'de_dust',
    mapUrl: '/map/de_dust.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2850,
      end: 3294
    },
    yRange: {
      start: -2071,
      end: 4073
    }
  },
  'de_dust2': {
    name: 'de_dust2',
    mapUrl: '/map/de_dust2.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_dust2_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2476,
      end: 2029.6
    },
    yRange: {
      start: -1266.6,
      end: 3239
    }
  },
  'de_inferno': {
    name: 'de_inferno',
    mapUrl: '/map/de_inferno.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_inferno_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2087,
      end: 2930.6
    },
    yRange: {
      start: -1147.6,
      end: 3870
    }
  },
  'de_inferno_s2': {
    name: 'de_inferno_s2',
    mapUrl: '/map/de_inferno_s2.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2087,
      end: 2930.6
    },
    yRange: {
      start: -1147.6,
      end: 3870
    }
  },
  'de_mirage': {
    name: 'de_mirage',
    mapUrl: '/map/de_mirage.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_mirage_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -3230,
      end: 1890
    },
    yRange: {
      start: -3407,
      end: 1713
    }
  },
  'de_nuke': {
    name: 'de_nuke',
    mapUrl: '/map/de_nuke.svg',
    leftSideGroundMap: '/leftSideGroundMap/de_nuke_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -3453,
      end: 3715
    },
    yRange: {
      start: -4281,
      end: 2887
    },
    dualLayer: { zLayerThreshold: -480, offset: 1024 },
  },
  'de_overpass': {
    name: 'de_overpass',
    mapUrl: '/map/de_overpass.png',
    leftSideGroundMap: '/leftSideGroundMap/de_overpass_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -4831,
      end: 493.8
    },
    yRange: {
      start: -3543.8,
      end: 1781
    }
  },
  'de_overpass_2v2': {
    name: 'de_overpass_2v2',
    mapUrl: '/map/de_overpass_2v2.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -4831,
      end: 493.8
    },
    yRange: {
      start: -3543.8,
      end: 1781
    }
  },
  'de_train': {
    name: 'de_train',
    mapUrl: '/map/de_train.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2308,
      end: 1872.046848
    },
    yRange: {
      start: -2102.046848,
      end: 2078
    },
    // 游戏 overview 的 verticalsections 分界为 -50；两张完整雷达图并排展示。
    dualLayer: { zLayerThreshold: -50, offset: 0, mapUrl2: '/map/de_train_lower.png' },
  },
  'de_vertigo': {
    name: 'de_vertigo',
    mapUrl: '/map/de_vertigo.png',
    leftSideGroundMap: '/leftSideGroundMap/de_vertigo_left.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -3168,
      end: 928
    },
    yRange: {
      start: -2334,
      end: 1762
    },
    // 游戏 overview 的 verticalsections 分界为 11700。
    dualLayer: { zLayerThreshold: 11700, offset: 0, mapUrl2: '/map/de_vertigo_lower.png' },
  },
  'workshop_preview': {
    name: 'workshop_preview',
    mapUrl: '/map/workshop_preview.svg',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2071,
      end: -331
    },
    yRange: {
      start: -1029,
      end: 711
    }
  },
};

export const DEFAULT_MAP = 'de_dust2';
