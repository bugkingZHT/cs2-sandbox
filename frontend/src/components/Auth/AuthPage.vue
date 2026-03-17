<template>
  <div class="auth-root">
    <!-- =====================================================
         左侧：品牌 / 内容区
         图片不存在时自动显示渐变兜底背景。
         未来可在 .auth-left 内部自由添加 iframe、视频、公告等内容。
         ===================================================== -->
    <div class="auth-left" :style="authLeftStyle">
      <div class="auth-left-overlay">
        <div class="auth-brand">
          <img src="/logo/logo.png" class="auth-logo" alt="Snowbo" @error="onLogoError" />
          <div>
            <h1 class="auth-brand-title">Snowbo | 雪豹</h1>
            <p class="auth-brand-sub">CS2 战术工坊</p>
          </div>
        </div>
        <!-- 未来可在此处添加自定义内容，例如：
          <iframe src="..." class="auth-promo-video" allowfullscreen />
          <div class="auth-announcement">...</div>
        -->
      </div>
    </div>

    <!-- 右侧：认证卡片 -->
    <div class="auth-right">
      <div class="auth-card">
        <!-- 移动端 Logo（左侧隐藏时展示） -->
        <div class="auth-card-logo">
          <img src="/logo/logo.png" class="auth-card-logo-img" alt="Snowbo" @error="onLogoError" />
          <span class="auth-card-logo-text">Snowbo</span>
        </div>

        <!-- Tab 切换 -->
        <div class="auth-tabs">
          <button
            class="auth-tab-btn"
            :class="{ active: activeTab === 'login' }"
            @click="activeTab = 'login'"
          >登录</button>
          <button
            class="auth-tab-btn"
            :class="{ active: activeTab === 'register' }"
            @click="activeTab = 'register'"
          >注册</button>
          <button
            class="auth-tab-btn"
            :class="{ active: activeTab === 'wechat' }"
            @click="activeTab = 'wechat'"
          >微信</button>
        </div>

        <!-- ===== 登录 Tab ===== -->
        <div v-if="activeTab === 'login'" class="auth-form">
          <div class="auth-field">
            <label class="auth-label">邮箱 / 用户名</label>
            <input
              v-model="loginIdentity"
              class="auth-input"
              type="text"
              placeholder="输入邮箱或用户名"
              autocomplete="username"
              @keydown.enter="doLogin"
            />
          </div>
          <div class="auth-field">
            <label class="auth-label">密码</label>
            <input
              v-model="loginPassword"
              class="auth-input"
              type="password"
              placeholder="输入密码"
              autocomplete="current-password"
              @keydown.enter="doLogin"
            />
          </div>
          <p v-if="loginError" class="auth-error">{{ loginError }}</p>
          <button
            class="auth-submit-btn"
            :disabled="loginLoading"
            @click="doLogin"
          >
            <span v-if="loginLoading" class="auth-spinner"></span>
            {{ loginLoading ? '登录中…' : '登录' }}
          </button>
          <p class="auth-switch">
            还没有账号？
            <button class="auth-link-btn" @click="activeTab = 'register'">立即注册</button>
          </p>
        </div>

        <!-- ===== 注册 Tab ===== -->
        <div v-else-if="activeTab === 'register'" class="auth-form">
          <!-- Step 1: 邮箱 + 发送验证码 -->
          <div class="auth-field">
            <label class="auth-label">邮箱</label>
            <div class="auth-row">
              <input
                v-model="regEmail"
                class="auth-input"
                type="email"
                placeholder="your@email.com"
                autocomplete="email"
              />
              <button
                class="auth-code-btn"
                :disabled="codeSending || codeCountdown > 0"
                @click="doSendCode"
              >
                <span v-if="codeSending" class="auth-spinner sm"></span>
                <span v-else-if="codeCountdown > 0">{{ codeCountdown }}s</span>
                <span v-else>发送验证码</span>
              </button>
            </div>
          </div>
          <!-- Step 2: 验证码（发送后展开） -->
          <Transition name="slide-down">
            <div v-if="codeSent" class="auth-field">
              <label class="auth-label">验证码</label>
              <input
                v-model="regCode"
                class="auth-input code-input"
                type="text"
                inputmode="numeric"
                maxlength="6"
                placeholder="6 位数字验证码"
                autocomplete="one-time-code"
              />
            </div>
          </Transition>
          <div class="auth-field">
            <label class="auth-label">用户名</label>
            <input
              v-model="regUsername"
              class="auth-input"
              type="text"
              placeholder="2-32 个字符"
              autocomplete="username"
            />
          </div>
          <div class="auth-field">
            <label class="auth-label">密码</label>
            <input
              v-model="regPassword"
              class="auth-input"
              type="password"
              placeholder="至少 6 位"
              autocomplete="new-password"
            />
          </div>
          <div class="auth-field">
            <label class="auth-label">确认密码</label>
            <input
              v-model="regPasswordConfirm"
              class="auth-input"
              type="password"
              placeholder="再次输入密码"
              autocomplete="new-password"
              @keydown.enter="doRegister"
            />
          </div>
          <p v-if="regError" class="auth-error">{{ regError }}</p>
          <p v-if="regSuccess" class="auth-success">{{ regSuccess }}</p>
          <button
            class="auth-submit-btn"
            :disabled="regLoading"
            @click="doRegister"
          >
            <span v-if="regLoading" class="auth-spinner"></span>
            {{ regLoading ? '注册中…' : '注册' }}
          </button>
          <p class="auth-switch">
            已有账号？
            <button class="auth-link-btn" @click="activeTab = 'login'">直接登录</button>
          </p>
        </div>

        <!-- ===== 微信 Tab（预留） ===== -->
        <div v-else-if="activeTab === 'wechat'" class="auth-form auth-wechat">
          <div class="auth-wechat-qr">
            <!-- 微信图标占位 -->
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" class="auth-wechat-icon">
              <path fill-rule="evenodd" clip-rule="evenodd"
                d="M9.5 4C6.46 4 4 6.13 4 8.75c0 1.39.68 2.63 1.76 3.5-.13.4-.38.98-.76 1.5a.5.5 0 0 0 .57.75c.87-.26 1.65-.68 2.25-1.07.53.13 1.1.2 1.68.2.27 0 .54-.01.8-.04A4.49 4.49 0 0 0 10 14.5c0 2.49 2.24 4.5 5 4.5.52 0 1.02-.08 1.49-.21.53.33 1.2.68 1.96.88a.5.5 0 0 0 .57-.74c-.32-.44-.54-.9-.66-1.25A4.23 4.23 0 0 0 20 14.5C20 12.01 17.76 10 15 10c-.17 0-.35.01-.52.03C14.15 6.68 12.1 4 9.5 4z"
                fill="currentColor" opacity="0.7"
              />
            </svg>
            <p class="auth-wechat-tip">微信扫码登录</p>
            <p class="auth-wechat-coming">即将开放，敬请期待</p>
          </div>
          <p class="auth-switch">
            使用邮箱
            <button class="auth-link-btn" @click="activeTab = 'login'">账号登录</button>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '@/composables/useAuth';

const { setUser } = useAuth();

// ---- tab ----
const activeTab = ref<'login' | 'register' | 'wechat'>('login');

// ---- login ----
const loginIdentity = ref('');
const loginPassword = ref('');
const loginError = ref('');
const loginLoading = ref(false);

async function doLogin() {
  loginError.value = '';
  if (!loginIdentity.value.trim() || !loginPassword.value) {
    loginError.value = '请填写账号和密码';
    return;
  }
  loginLoading.value = true;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ identity: loginIdentity.value.trim(), password: loginPassword.value }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK' && json?.data) {
      setUser({ uid: json.data.uid, username: json.data.username });
    } else {
      loginError.value = json?.error || '登录失败，请稍后重试';
    }
  } catch {
    loginError.value = '网络异常，请稍后重试';
  } finally {
    loginLoading.value = false;
  }
}

// ---- register ----
const regEmail = ref('');
const regCode = ref('');
const regUsername = ref('');
const regPassword = ref('');
const regPasswordConfirm = ref('');
const regError = ref('');
const regSuccess = ref('');
const regLoading = ref(false);
const codeSent = ref(false);
const codeSending = ref(false);
const codeCountdown = ref(0);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown(seconds = 60) {
  codeCountdown.value = seconds;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    codeCountdown.value--;
    if (codeCountdown.value <= 0) {
      clearInterval(countdownTimer!);
      countdownTimer = null;
    }
  }, 1000);
}

async function doSendCode() {
  regError.value = '';
  const email = regEmail.value.trim().toLowerCase();
  if (!email) {
    regError.value = '请输入邮箱';
    return;
  }
  codeSending.value = true;
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, purpose: 'register' }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK') {
      codeSent.value = true;
      startCountdown(60);
    } else {
      regError.value = json?.error || '发送失败，请稍后重试';
    }
  } catch {
    regError.value = '网络异常，请稍后重试';
  } finally {
    codeSending.value = false;
  }
}

async function doRegister() {
  regError.value = '';
  regSuccess.value = '';
  if (!regEmail.value.trim()) { regError.value = '请输入邮箱'; return; }
  if (!codeSent.value || !regCode.value.trim()) { regError.value = '请先获取并填写验证码'; return; }
  if (!regUsername.value.trim()) { regError.value = '请输入用户名'; return; }
  if (regPassword.value.length < 6) { regError.value = '密码至少 6 位'; return; }
  if (regPassword.value !== regPasswordConfirm.value) { regError.value = '两次密码不一致'; return; }

  regLoading.value = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: regEmail.value.trim().toLowerCase(),
        code: regCode.value.trim(),
        username: regUsername.value.trim(),
        password: regPassword.value,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK' && json?.data) {
      setUser({ uid: json.data.uid, username: json.data.username });
    } else {
      regError.value = json?.error || '注册失败，请稍后重试';
    }
  } catch {
    regError.value = '网络异常，请稍后重试';
  } finally {
    regLoading.value = false;
  }
}

// ---- helpers ----
// 背景图通过 CSS background-image 引用，避免 Vite 构建期资产解析报错。
// 用多背景写法：图片在前（优先显示），渐变在后（图片 404 时自动兜底）。
const authLeftStyle = {
  backgroundImage: "url('/auth-bg/auth-bg.jpg'), linear-gradient(135deg, #0d1117 0%, #161b22 60%, #1c2a3a 100%)",
};

function onLogoError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}
</script>

<style scoped>
/* =====================================================
   Layout
   ===================================================== */
.auth-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-primary-solid);
  overflow: hidden;
}

/* =====================================================
   Left panel
   ===================================================== */
.auth-left {
  flex: 1;
  position: relative;
  display: flex;
  align-items: flex-end;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.auth-left-overlay {
  position: relative;
  z-index: 1;
  padding: 48px;
  width: 100%;
}

.auth-brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.auth-logo {
  width: 52px;
  height: 52px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
}

.auth-brand-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.auth-brand-sub {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.65);
  margin: 4px 0 0;
}

/* 移动端隐藏左侧 */
@media (max-width: 768px) {
  .auth-left {
    display: none;
  }
}

/* =====================================================
   Right panel
   ===================================================== */
.auth-right {
  width: 420px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-bg-secondary);
  padding: 32px 24px;
  overflow-y: auto;
}

@media (max-width: 768px) {
  .auth-right {
    width: 100%;
  }
}

/* =====================================================
   Card
   ===================================================== */
.auth-card {
  width: 100%;
  max-width: 360px;
}

.auth-card-logo {
  display: none;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

@media (max-width: 768px) {
  .auth-card-logo {
    display: flex;
  }
}

.auth-card-logo-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.auth-card-logo-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--ds-text-primary);
}

/* =====================================================
   Tabs
   ===================================================== */
.auth-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--ds-border-subtle);
  margin-bottom: 24px;
}

.auth-tab-btn {
  flex: 1;
  padding: 10px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  color: var(--ds-text-tertiary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.auth-tab-btn:hover {
  color: var(--ds-text-secondary);
}

.auth-tab-btn.active {
  color: var(--ds-text-primary);
  border-bottom-color: #4dabf7;
}

/* =====================================================
   Form
   ===================================================== */
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--ds-text-secondary);
}

.auth-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--ds-bg-tertiary);
  border: 1px solid var(--ds-border-default);
  border-radius: 8px;
  color: var(--ds-text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.auth-input:focus {
  border-color: #4dabf7;
}

.auth-input::placeholder {
  color: var(--ds-text-muted);
}

/* 验证码输入框加大字号 */
.code-input {
  letter-spacing: 4px;
  font-size: 18px;
  font-weight: 600;
}

/* 邮箱行：输入框 + 发送按钮 */
.auth-row {
  display: flex;
  gap: 8px;
}

.auth-row .auth-input {
  flex: 1;
  min-width: 0;
}

.auth-code-btn {
  flex-shrink: 0;
  padding: 10px 14px;
  background: rgba(77, 171, 247, 0.1);
  border: 1px solid rgba(77, 171, 247, 0.3);
  border-radius: 8px;
  color: #4dabf7;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s, border-color 0.2s;
  min-width: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.auth-code-btn:hover:not(:disabled) {
  background: rgba(77, 171, 247, 0.2);
  border-color: rgba(77, 171, 247, 0.5);
}

.auth-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-submit-btn {
  width: 100%;
  padding: 12px;
  background: #4dabf7;
  border: none;
  border-radius: 8px;
  color: #0d1117;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s, opacity 0.2s;
  margin-top: 4px;
}

.auth-submit-btn:hover:not(:disabled) {
  background: #74c0fc;
}

.auth-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* =====================================================
   Feedback
   ===================================================== */
.auth-error {
  font-size: 13px;
  color: var(--ds-danger);
  margin: 0;
}

.auth-success {
  font-size: 13px;
  color: var(--ds-success);
  margin: 0;
}

.auth-switch {
  font-size: 13px;
  color: var(--ds-text-tertiary);
  text-align: center;
  margin: 0;
}

.auth-link-btn {
  background: none;
  border: none;
  color: #4dabf7;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.auth-link-btn:hover {
  color: #74c0fc;
}

/* =====================================================
   WeChat placeholder
   ===================================================== */
.auth-wechat {
  align-items: center;
}

.auth-wechat-qr {
  width: 200px;
  height: 200px;
  border: 2px dashed var(--ds-border-default);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--ds-bg-tertiary);
}

.auth-wechat-icon {
  color: var(--ds-text-tertiary);
}

.auth-wechat-tip {
  font-size: 14px;
  font-weight: 600;
  color: var(--ds-text-secondary);
  margin: 0;
}

.auth-wechat-coming {
  font-size: 12px;
  color: var(--ds-text-muted);
  margin: 0;
}

/* =====================================================
   Spinner
   ===================================================== */
.auth-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(13, 17, 23, 0.3);
  border-top-color: #0d1117;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.auth-spinner.sm {
  width: 12px;
  height: 12px;
  border-width: 2px;
  border-color: rgba(77, 171, 247, 0.3);
  border-top-color: #4dabf7;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* =====================================================
   Transition: slide-down for verification code field
   ===================================================== */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
  max-height: 80px;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px);
}
</style>
