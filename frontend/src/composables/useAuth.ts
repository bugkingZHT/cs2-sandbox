import { ref, computed } from 'vue';

export interface AuthUser {
  id?: number;
  uid: string;
  username: string;
  role?: 'normal' | 'pro' | 'pro+';
  quota_limit?: number;
  quota_used?: number;
}

const currentUser = ref<AuthUser | null>(null);

function parseMeData(data: Record<string, unknown>): AuthUser {
  return {
    id: typeof data?.id === 'number' ? data.id : undefined,
    uid: String(data?.uid ?? ''),
    username: String(data?.username ?? ''),
    role: data?.role === 'pro' || data?.role === 'pro+' ? data.role : 'normal',
    quota_limit: typeof data?.quota_limit === 'number' ? data.quota_limit : 0,
    quota_used: typeof data?.quota_used === 'number' ? data.quota_used : 0,
  };
}

/** 在页面挂载前调用，校验 session 并设置 currentUser，避免首屏闪烁。应在 main.ts 中 await 后再 mount。 */
export async function initAuth(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK' && json?.data) {
      currentUser.value = parseMeData(json.data as Record<string, unknown>);
    } else {
      currentUser.value = null;
    }
  } catch {
    currentUser.value = null;
  }
}

export function useAuth() {
  /** 发现 session 过期时调用：清除本地用户并触发 toast（任何需要登录的接口返回 401 时都应触发） */
  const handleSessionExpired = () => {
    const hadUser = currentUser.value !== null;
    currentUser.value = null;
    if (hadUser) {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
  };

  const fetchAuthMe = async () => {
    const wasLoggedIn = currentUser.value !== null;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.status === 'OK' && json?.data) {
        currentUser.value = parseMeData(json.data as Record<string, unknown>);
      } else {
        currentUser.value = null;
        if (res.status === 401 && wasLoggedIn) {
          window.dispatchEvent(new CustomEvent('session-expired'));
        }
      }
    } catch {
      currentUser.value = null;
    }
  };

  const setUser = (user: AuthUser) => {
    currentUser.value = user;
  };

  const clearUser = () => {
    currentUser.value = null;
  };

  /** Truncate username for display (e.g. sidebar). Default max 10 chars. */
  const truncatedUsername = computed(() => {
    const u = currentUser.value?.username;
    if (!u) return '';
    const max = 10;
    return u.length > max ? u.slice(0, max) + '…' : u;
  });

  return {
    currentUser,
    truncatedUsername,
    fetchAuthMe,
    setUser,
    clearUser,
    handleSessionExpired,
  };
}
