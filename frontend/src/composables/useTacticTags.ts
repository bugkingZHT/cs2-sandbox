import { ref, computed, watch } from 'vue';
import { PRESET_TACTIC_TAGS } from '@/types/tactics';

const STORAGE_KEY = 'snowbo-tactic-tags';

function loadCustomTags(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
}

/**
 * 预设 4 个 + 自定义（localStorage）。自定义通过 addCustomTag 添加并持久化。
 */
export function useTacticTags() {
  const customTags = ref<string[]>(loadCustomTags());

  const allTags = computed(() => [...PRESET_TACTIC_TAGS, ...customTags.value]);

  watch(customTags, (val) => saveCustomTags(val), { deep: true });

  function addCustomTag(tag: string) {
    const t = tag.trim();
    if (!t) return false;
    const lower = t.toLowerCase();
    const exists =
      PRESET_TACTIC_TAGS.some((p) => p.toLowerCase() === lower) ||
      customTags.value.some((c) => c.toLowerCase() === lower);
    if (exists) return false;
    customTags.value = [...customTags.value, t];
    return true;
  }

  function removeCustomTag(tag: string) {
    customTags.value = customTags.value.filter((t) => t !== tag);
  }

  return {
    presetTags: PRESET_TACTIC_TAGS,
    customTags,
    allTags,
    addCustomTag,
    removeCustomTag,
  };
}
