/** PNG 底图默认像素尺寸，与 xRange/yRange 配合做比例坐标换算 */
export const MAP_IMAGE_SIZE = 1024;

/** SVG 底图默认像素尺寸，与 xRange/yRange 配合做比例坐标换算 */
export const MAP_SVG_IMAGE_SIZE = 2048;

/**
 * SVG 作为纹理加载时的栅格化分辨率倍数（Pixi Assets.load data.resolution）。
 * 越大放大越清晰，纹理尺寸与显存占用也越高（单纹理最大 4096×4096）。
 * @default 4
 */
export const SVG_TEXTURE_RESOLUTION = 4;

export interface MapConfig {
  name: string;
  imageUrl: string;
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
}

/** 根据地图名得到 SVG 底图 URL，若该路径不存在则应降级使用 config.imageUrl (PNG) */
export function getMapSvgUrl(mapName: string): string {
  return `/map/${mapName}.svg`;
}

export const MAP_CONFIGS: Record<string, MapConfig> = {
  'ar_baggage': {
    name: 'ar_baggage',
    imageUrl: '/backGroundMap/ar_baggage.png',
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
    imageUrl: '/backGroundMap/ar_shoots.png',
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
    imageUrl: '/backGroundMap/ar_shoots_night.png',
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
    imageUrl: '/backGroundMap/cs_italy.png',
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
    imageUrl: '/backGroundMap/cs_office.png',
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
    imageUrl: '/backGroundMap/de_ancient.png',
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
    imageUrl: '/backGroundMap/de_ancient_night.png',
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
    imageUrl: '/backGroundMap/de_ancient_v1.png',
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
    imageUrl: '/backGroundMap/de_ancient_v2.png',
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
    imageUrl: '/backGroundMap/de_anubis.png',
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
  'de_dust': {
    name: 'de_dust',
    imageUrl: '/backGroundMap/de_dust.png',
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
    imageUrl: '/backGroundMap/de_dust2.png',
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
    imageUrl: '/backGroundMap/de_inferno.png',
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
    imageUrl: '/backGroundMap/de_inferno_s2.png',
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
    imageUrl: '/backGroundMap/de_mirage.png',
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
    imageUrl: '/backGroundMap/de_nuke.png',
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
    }
  },
  'de_overpass': {
    name: 'de_overpass',
    imageUrl: '/backGroundMap/de_overpass.png',
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
    imageUrl: '/backGroundMap/de_overpass_2v2.png',
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
    imageUrl: '/backGroundMap/de_train.png',
    width: 1024,
    height: 1024,
    xRange: {
      start: -2308,
      end: 1872.05
    },
    yRange: {
      start: -2102.05,
      end: 2078
    }
  },
  'de_vertigo': {
    name: 'de_vertigo',
    imageUrl: '/backGroundMap/de_vertigo.png',
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
    }
  },
  'workshop_preview': {
    name: 'workshop_preview',
    imageUrl: '/backGroundMap/workshop_preview.png',
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
