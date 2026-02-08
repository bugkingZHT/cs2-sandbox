/**
 * 由 Go 托管路由，前端仅根据 window.location 同步状态，不做路由库依赖。
 */
import { ref, onMounted, onUnmounted } from 'vue';

export const pathRef = ref(window.location.pathname);
export const searchRef = ref(window.location.search);

function updateFromWindow() {
  pathRef.value = window.location.pathname;
  searchRef.value = window.location.search;
}

export function useLocation() {
  onMounted(() => {
    updateFromWindow();
    window.addEventListener('popstate', updateFromWindow);
    window.addEventListener('app:location-changed', updateFromWindow);
  });
  onUnmounted(() => {
    window.removeEventListener('popstate', updateFromWindow);
    window.removeEventListener('app:location-changed', updateFromWindow);
  });
  return { pathRef, searchRef };
}

function normalizeSearch(s: string): string {
  if (!s) return '';
  return s.startsWith('?') ? s : '?' + s;
}

/** 前端导航：仅改 URL，不刷新页面；Go 已注册对应路径。 */
export function navigate(path: string, search = '') {
  const q = normalizeSearch(search);
  const url = path + q;
  if (window.location.pathname === path && window.location.search === q) return;
  history.pushState(null, '', url);
  pathRef.value = path;
  searchRef.value = q;
}

/** 仅替换当前历史记录（用于 replayer 切 round 等） */
export function replaceLocation(path: string, search: string) {
  const q = normalizeSearch(search);
  history.replaceState(null, '', path + q);
  pathRef.value = path;
  searchRef.value = q;
  window.dispatchEvent(new CustomEvent('app:location-changed'));
}

/** 从 search 解析 query 参数；不传参时用 searchRef 或 window.location.search（刷新时用后者保证拿到当前 URL） */
export function getQuery(searchOverride?: string): Record<string, string> {
  const s = searchOverride ?? searchRef.value ?? window.location.search;
  const out: Record<string, string> = {};
  if (!s || !s.startsWith('?')) return out;
  const params = new URLSearchParams(s.slice(1));
  params.forEach((v, k) => { out[k] = v; });
  return out;
}
