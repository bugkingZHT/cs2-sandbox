import { reactive, toRefs, watch } from 'vue';

const storageKey = 'cs2-sandbox-map-display';
const settings = reactive({
  showMapPlayers: true,
  showMapProjectiles: true,
  showMapDropped: true,
  showMapBomb: true,
});

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
    if (typeof saved?.[key] === 'boolean') settings[key] = saved[key];
  }
} catch { /* Use defaults when browser storage is unavailable or corrupt. */ }

watch(settings, value => {
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Settings still work in memory. */ }
}, { flush: 'sync' });

// Shared by the always-mounted settings dialog and any subsequently opened replay.
const fields = toRefs(settings);
export const useMapDisplaySettings = () => fields;
