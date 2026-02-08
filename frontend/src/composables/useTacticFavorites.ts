import { ref, watch, type Ref } from 'vue';
import type { TacticFavorite } from '@/types/tactics';
import { getTacticFavoritesStorage } from '@/composables/indexdb-storage';

/**
 * Load and maintain favorites for a given pageUrl; provides save/delete and reactive list.
 */
export function useTacticFavorites(pageUrlRef: Ref<string>) {
  const pageFavorites = ref<TacticFavorite[]>([]);

  async function refresh() {
    const url = pageUrlRef.value;
    if (!url) {
      pageFavorites.value = [];
      return;
    }
    try {
      const storage = await getTacticFavoritesStorage();
      const list = await storage.getByPageUrl(url);
      pageFavorites.value = list.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    } catch (e) {
      console.error('[useTacticFavorites] load failed:', e);
      pageFavorites.value = [];
    }
  }

  watch(pageUrlRef, () => refresh(), { immediate: true });

  async function save(favorite: TacticFavorite): Promise<void> {
    const storage = await getTacticFavoritesStorage();
    await storage.save(favorite);
    await refresh();
  }

  async function remove(id: string): Promise<void> {
    const storage = await getTacticFavoritesStorage();
    await storage.delete(id);
    await refresh();
  }

  return { pageFavorites, save, remove, refresh };
}
