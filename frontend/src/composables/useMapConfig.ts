import { computed } from 'vue';
import { MAP_CONFIGS, DEFAULT_MAP, isDualLayerMap } from '@/config/map';

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

  const mapRange2 = computed(() => {
    const xr = currentMapConfig.xRange2 ?? currentMapConfig.xRange;
    const yr = currentMapConfig.yRange2 ?? currentMapConfig.yRange;
    return {
      xMin: xr.start,
      xMax: xr.end,
      yMin: yr.start,
      yMax: yr.end,
      xRange: xr.end - xr.start,
      yRange: yr.end - yr.start,
    };
  });

  const isDualLayer = computed(() => isDualLayerMap(currentMapConfig));
  const zLayerThreshold = computed(() => currentMapConfig.dualLayer?.zLayerThreshold ?? 0);
  const layerOffset = computed(() => currentMapConfig.dualLayer?.offset ?? 0);

  return {
    currentMapConfig,
    mapRange,
    mapRange2,
    isDualLayer,
    zLayerThreshold,
    layerOffset,
    mapName: currentMapConfig.name,
    mapImageUrl: currentMapConfig.imageUrl,
    mapWidth: currentMapConfig.width,
    mapHeight: currentMapConfig.height,
  };
};