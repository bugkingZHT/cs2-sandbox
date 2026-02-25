import { ref, onMounted, onBeforeUnmount } from 'vue';

/**
 * 浏览器兼容性工具函数
 * 包含各种浏览器 API 的 polyfill 和兼容性处理
 */

/**
 * requestIdleCallback polyfill for mobile Safari compatibility
 * @param callback - 要在空闲时执行的回调函数
 * @param options - 可选配置参数
 * @returns 唯一的 ID，可用于 cancelIdleCallback
 */
export function requestIdleCallbackPolyfill(
  callback: () => void, 
  options?: { timeout?: number }
): number {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  }
  // Fallback to setTimeout for browsers that don't support requestIdleCallback
  return setTimeout(() => {
    callback();
  }, options?.timeout ?? 1) as unknown as number;
}

/**
 * cancelIdleCallback polyfill
 * @param handle - requestIdleCallback 返回的 ID
 */
export function cancelIdleCallbackPolyfill(handle: number): void {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}

// 导出别名，方便使用
export const requestIdleCallback = requestIdleCallbackPolyfill;
export const cancelIdleCallback = cancelIdleCallbackPolyfill;

/**
 * 检查浏览器是否支持特定的 API
 * @param apiName - API 名称
 * @returns boolean - 是否支持
 */
export function isApiSupported(apiName: string): boolean {
  if (typeof window === 'undefined') return false;
  return apiName in window;
}

/**
 * 检查是否为移动设备浏览器
 * @returns boolean - true: 移动端, false: 非移动端
 */
export function isMobileBrowser(): boolean {
  // 若运行环境无 window 对象（如 Node.js），直接返回 false
  if (typeof window === 'undefined' || !window.navigator) {
    return false;
  }

  const { userAgent } = window.navigator;
  // 匹配常见移动端设备的 UA 特征（覆盖手机/平板）
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;
  
  // 双重校验：UA 匹配 + 屏幕触摸特性（部分设备UA伪装时的兜底）
  const isMobileUA = mobileRegex.test(userAgent);
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // 特殊处理：iPadOS 会伪装成桌面 Safari，需单独识别
  const isIPadOS = /Macintosh/.test(userAgent) && isTouchDevice;

  return isMobileUA || isIPadOS || (isTouchDevice && window.innerWidth < 768);
}

/**
 * Vue composables: 响应式的移动端检测
 * @returns 响应式的 isMobile ref
 */
export function useMobileDetection() {
  const isMobile = ref(false);

  const updateMobileStatus = () => {
    isMobile.value = isMobileBrowser();
  };

  onMounted(() => {
    updateMobileStatus();
    window.addEventListener('resize', updateMobileStatus);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateMobileStatus);
  });

  return { isMobile };
}