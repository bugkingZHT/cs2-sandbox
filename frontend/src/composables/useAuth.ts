import { ref, computed } from 'vue';

export interface AuthUser {
  uid: string;
  username: string;
}

const currentUser = ref<AuthUser | null>(null);

/** 在页面挂载前调用，校验 session 并设置 currentUser，避免首屏闪烁。应在 main.ts 中 await 后再 mount。 */
export async function initAuth(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK' && json?.data) {
      currentUser.value = { uid: json.data.uid, username: json.data.username };
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
        currentUser.value = { uid: json.data.uid, username: json.data.username };
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
