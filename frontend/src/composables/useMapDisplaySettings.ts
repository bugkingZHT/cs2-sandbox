import { reactive, toRefs, watch } from 'vue';
import { PLAYER_DISPLAY_CONTROLS } from '@/config/map';

const storageKey = 'cs2-sandbox-map-display';
const playerSizeVersion = 2;
type MapView = '2d' | '3d';
const settings = reactive({
  defaultMapView: '2d' as MapView,
  showMapDropped: true,
  playerHeightScaling: true,
  playerSize: PLAYER_DISPLAY_CONTROLS.playerSize.default as number,
  playerNameSize: PLAYER_DISPLAY_CONTROLS.playerNameSize.default as number,
});

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (saved?.defaultMapView === '2d' || saved?.defaultMapView === '3d') settings.defaultMapView = saved.defaultMapView;
  for (const key of ['showMapDropped', 'playerHeightScaling'] as const) {
    if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
  }
  for (const key of ['playerSize', 'playerNameSize'] as const) {
    // Previous percentages used different baselines; start them at the new defaults.
    if (saved?.playerSizeVersion !== playerSizeVersion) continue;
    const value = saved?.[key];
    const { min, max } = PLAYER_DISPLAY_CONTROLS[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      settings[key] = Math.min(max, Math.max(min, value));
    }
  }
} catch { /* Use defaults when browser storage is unavailable or corrupt. */ }

watch(settings, value => {
  try { localStorage.setItem(storageKey, JSON.stringify({ ...value, playerSizeVersion })); } catch { /* Settings still work in memory. */ }
}, { flush: 'sync' });

// Shared by the always-mounted settings dialog and any subsequently opened replay.
const fields = toRefs(settings);
export const useMapDisplaySettings = () => fields;
