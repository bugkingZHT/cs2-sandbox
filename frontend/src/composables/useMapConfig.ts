import { computed } from 'vue';
import { MAP_CONFIGS, DEFAULT_MAP } from '@/config/map';

export const useMapConfig = (mapName: string = DEFAULT_MAP) => {
  const currentMapConfig = MAP_CONFIGS[mapName] || MAP_CONFIGS[DEFAULT_MAP];

  const mapRange = computed(() => ({
    xMin: currentMapConfig.xRange.start,
    xMax: currentMapConfig.xRange.end,
    yMin: currentMapConfig.yRange.start,
    yMax: currentMapConfig.yRange.end,
    xRange: currentMapConfig.xRange.end - currentMapConfig.xRange.start,
    yRange: currentMapConfig.yRange.end - currentMapConfig.yRange.start,
  }));

  return {
    currentMapConfig,
    mapRange,
    mapName: currentMapConfig.name,
    mapImageUrl: currentMapConfig.imageUrl,
    mapWidth: currentMapConfig.width,
    mapHeight: currentMapConfig.height,
  };
};