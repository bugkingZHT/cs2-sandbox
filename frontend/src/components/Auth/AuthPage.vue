<template>
  <div class="auth-root">
    <!-- =====================================================
         左侧：Demo iframe 嵌入区
         嵌入一个可交互的 demo 播放器，让用户可以直接体验功能
         ===================================================== -->
    <div class="auth-left">
      <iframe
        :src="AUTH_PAGE_CONFIG.DEMO_PREVIEW_URL"
        class="auth-demo-iframe"
        frameborder="0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
        title="cs2-sandbox Demo 预览"
      ></iframe>

    </div>

    <!-- 右侧：认证卡片 -->
    <div class="auth-right">
      <div class="auth-card">
        <!-- 品牌标题区 -->
        <div class="auth-card-brand-header">
          <img src="/logo/logo.png" class="auth-card-brand-logo" alt="cs2-sandbox" @error="onLogoError" />
          <div class="auth-card-brand-text">
            <h1 class="auth-card-brand-title">cs2-sandbox</h1>
            <p class="auth-card-brand-sub">打职业呢？这样研究 Demo</p>
          </div>
        </div>

        <!-- 功能亮点 -->
        <!-- <div class="auth-features">
          <div class="auth-feature-item">
            <span class="auth-feature-icon">🎯</span>
            <span class="auth-feature-text">2D 战术回放</span>
          </div>
          <div class="auth-feature-item">
            <span class="auth-feature-icon">💣</span>
            <span class="auth-feature-text">投掷物分析</span>
          </div>
          <div class="auth-feature-item">
            <span class="auth-feature-icon">✏️</span>
            <span class="auth-feature-text">战术板标注</span>
          </div>
        </div> -->

        <!-- 移动端 Logo（左侧隐藏时展示） -->
        <div class="auth-card-logo">
          <img src="/logo/logo.png" class="auth-card-logo-img" alt="cs2-sandbox" @error="onLogoError" />
          <span class="auth-card-logo-text">cs2-sandbox</span>
        </div>

        <!-- Tab 切换（找回密码时隐藏） -->
        <div v-if="activeTab !== 'reset'" class="auth-tabs">
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
        <!-- 找回密码时显示返回标题 -->
        <div v-else class="auth-reset-header">
          <button class="auth-back-btn" @click="activeTab = 'login'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            返回登录
          </button>
          <span class="auth-reset-title">找回密码</span>
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
          <div class="auth-login-footer">
            <p class="auth-switch">
              还没有账号？
              <button class="auth-link-btn" @click="activeTab = 'register'">立即注册</button>
            </p>
            <button class="auth-link-btn auth-forgot-btn" @click="goToReset">忘记密码？</button>
          </div>
        </div>

        <!-- ===== 注册 Tab ===== -->
        <div v-else-if="activeTab === 'register'" class="auth-form">
          <!-- Stage 1: Fill all fields and validate -->
          <div v-if="!codeSent" class="reg-stage1">
            <div class="auth-field">
              <label class="auth-label">邮箱</label>
              <input
                v-model="regEmail"
                class="auth-input"
                type="email"
                placeholder="your@email.com"
                autocomplete="email"
              />
            </div>
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
                @keydown.enter="handleStage1Submit"
              />
            </div>
            <p v-if="regStage1Error" class="auth-error">{{ regStage1Error }}</p>
            <button
              class="auth-submit-btn"
              :disabled="regStage1Loading"
              @click="handleStage1Submit"
            >
              <span v-if="regStage1Loading" class="auth-spinner"></span>
              {{ regStage1Loading ? '验证中…' : '获取验证码并注册' }}
            </button>
            <p class="auth-switch">
              已有账号？
              <button class="auth-link-btn" @click="activeTab = 'login'">直接登录</button>
            </p>
          </div>

          <!-- Stage 2: Verification Code + Complete Registration -->
          <div v-else-if="codeSent" class="reg-stage2">
            <div class="reg-verification-panel">
              <div class="reg-verification-header">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="reg-verification-icon">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <h3 class="reg-verification-title">验证邮箱</h3>
                <p class="reg-verification-message">我们已向 <strong>{{ regEmail }}</strong> 发送了验证码</p>
              </div>

              <div class="auth-field">
                <input
                  v-model="regCode"
                  class="auth-input code-input"
                  type="text"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="6 位数字验证码"
                  autocomplete="one-time-code"
                  @keydown.enter="completeRegistration"
                />
              </div>

              <p v-if="regStage2Error" class="auth-error">{{ regStage2Error }}</p>

              <div class="reg-stage2-actions">
                <button
                  class="auth-submit-btn"
                  :disabled="regStage2Loading || !regCode.trim()"
                  @click="completeRegistration"
                >
                  <span v-if="regStage2Loading" class="auth-spinner"></span>
                  {{ regStage2Loading ? '注册中…' : '完成注册' }}
                </button>

                <div class="reg-resend-row">
                  <button
                    class="auth-link-btn reg-resend-btn"
                    :disabled="codeSending || codeCountdown > 0"
                    @click="resendCode"
                  >
                    <span v-if="codeSending" class="auth-spinner sm"></span>
                    <span v-else-if="codeCountdown > 0">{{ codeCountdown }}s 后重发</span>
                    <span v-else>重发验证码</span>
                  </button>
                  
                  <button
                    class="auth-link-btn reg-back-btn"
                    @click="goBackToStage1"
                  >
                    返回修改
                  </button>
                </div>
              </div>
            </div>
          </div>
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

        <!-- ===== 找回密码 Tab ===== -->
        <div v-else-if="activeTab === 'reset'" class="auth-form">
          <div class="auth-field">
            <label class="auth-label">注册邮箱</label>
            <div class="auth-row">
              <input
                v-model="resetEmail"
                class="auth-input"
                type="email"
                placeholder="your@email.com"
                autocomplete="email"
              />
              <button
                class="auth-code-btn"
                :disabled="resetCodeSending || resetCodeCountdown > 0"
                @click="doSendResetCode"
              >
                <span v-if="resetCodeSending" class="auth-spinner sm"></span>
                <span v-else-if="resetCodeCountdown > 0">{{ resetCodeCountdown }}s</span>
                <span v-else>发送验证码</span>
              </button>
            </div>
          </div>
          <Transition name="slide-down">
            <div v-if="resetCodeSent" class="auth-field">
              <input
                v-model="resetCode"
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
            <label class="auth-label">新密码</label>
            <input
              v-model="resetNewPassword"
              class="auth-input"
              type="password"
              placeholder="至少 6 位"
              autocomplete="new-password"
            />
          </div>
          <div class="auth-field">
            <label class="auth-label">确认新密码</label>
            <input
              v-model="resetNewPasswordConfirm"
              class="auth-input"
              type="password"
              placeholder="再次输入新密码"
              autocomplete="new-password"
              @keydown.enter="doResetPassword"
            />
          </div>
          <p v-if="resetError" class="auth-error">{{ resetError }}</p>
          <p v-if="resetSuccess" class="auth-success">{{ resetSuccess }}</p>
          <button
            class="auth-submit-btn"
            :disabled="resetLoading"
            @click="doResetPassword"
          >
            <span v-if="resetLoading" class="auth-spinner"></span>
            {{ resetLoading ? '重置中…' : '重置密码' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { AUTH_PAGE_CONFIG } from '@/config/auth';

const { setUser } = useAuth();

// ---- tab ----
const activeTab = ref<'login' | 'register' | 'wechat' | 'reset'>('login');

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
// Stage 1 fields
const regEmail = ref('');
const regUsername = ref('');
const regPassword = ref('');
const regPasswordConfirm = ref('');
// Stage 1 state
const regStage1Loading = ref(false);
const regStage1Error = ref('');
// Stage 2 state
const regCode = ref('');
const regStage2Loading = ref(false);
const regStage2Error = ref('');
const regSuccess = ref('');
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

/**
 * Stage 1: Validate form and send verification code
 */
async function handleStage1Submit() {
  regStage1Error.value = '';
  
  // Frontend validation
  if (!regEmail.value.trim()) {
    regStage1Error.value = '请输入邮箱';
    return;
  }
  if (!regUsername.value.trim()) {
    regStage1Error.value = '请输入用户名';
    return;
  }
  if (regPassword.value.length < 6) {
    regStage1Error.value = '密码至少 6 位';
    return;
  }
  if (regPassword.value !== regPasswordConfirm.value) {
    regStage1Error.value = '两次密码不一致';
    return;
  }

  regStage1Loading.value = true;
  try {
    // Step 1: Check if email and username are available
    const checkRes = await fetch('/api/auth/check-registration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: regEmail.value.trim().toLowerCase(),
        username: regUsername.value.trim(),
      }),
    });
    const checkJson = await checkRes.json().catch(() => ({}));
    
    // 后端返回格式：{ status: "error", error: "具体错误信息" } 或 { status: "OK", data: { available: true } }
    if (!checkRes.ok || ((checkJson as any)?.status === 'error' && !(checkJson as any)?.data?.available)) {
      // 优先显示 error 字段（邮箱/用户名重复时的明确提示）
      regStage1Error.value = (checkJson as any)?.error || (checkJson as any)?.data?.message || '该邮箱或用户名已被使用';
      regStage1Loading.value = false;
      return;
    }

    // Step 2: Send verification code
    const sendRes = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        email: regEmail.value.trim().toLowerCase(), 
        purpose: 'register' 
      }),
    });
    const sendJson = await sendRes.json().catch(() => ({}));
    
    if (sendRes.ok && sendJson?.status === 'OK') {
      codeSent.value = true;
      startCountdown(60);
    } else {
      regStage1Error.value = sendJson?.error || '验证码发送失败，请稍后重试';
    }
  } catch {
    regStage1Error.value = '网络异常，请稍后重试';
  } finally {
    regStage1Loading.value = false;
  }
}

/**
 * Stage 2: Complete registration with verification code
 */
async function completeRegistration() {
  regStage2Error.value = '';
  regSuccess.value = '';
  
  if (!regCode.value.trim()) {
    regStage2Error.value = '请输入验证码';
    return;
  }

  regStage2Loading.value = true;
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
      regStage2Error.value = json?.error || '注册失败，请稍后重试';
    }
  } catch {
    regStage2Error.value = '网络异常，请稍后重试';
  } finally {
    regStage2Loading.value = false;
  }
}

/**
 * Resend verification code
 */
async function resendCode() {
  regStage2Error.value = '';
  codeSending.value = true;
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        email: regEmail.value.trim().toLowerCase(), 
        purpose: 'register' 
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK') {
      startCountdown(60);
    } else {
      regStage2Error.value = json?.error || '验证码发送失败，请稍后重试';
    }
  } catch {
    regStage2Error.value = '网络异常，请稍后重试';
  } finally {
    codeSending.value = false;
  }
}

/**
 * Go back to Stage 1 from Stage 2
 */
function goBackToStage1() {
  regCode.value = '';
  regStage2Error.value = '';
  codeSent.value = false;
  codeCountdown.value = 0;
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// ---- reset password ----
const resetEmail = ref('');
const resetCode = ref('');
const resetNewPassword = ref('');
const resetNewPasswordConfirm = ref('');
const resetError = ref('');
const resetSuccess = ref('');
const resetLoading = ref(false);
const resetCodeSent = ref(false);
const resetCodeSending = ref(false);
const resetCodeCountdown = ref(0);
let resetCountdownTimer: ReturnType<typeof setInterval> | null = null;

function goToReset() {
  resetEmail.value = '';
  resetCode.value = '';
  resetNewPassword.value = '';
  resetNewPasswordConfirm.value = '';
  resetError.value = '';
  resetSuccess.value = '';
  resetCodeSent.value = false;
  resetCodeCountdown.value = 0;
  if (resetCountdownTimer) { clearInterval(resetCountdownTimer); resetCountdownTimer = null; }
  activeTab.value = 'reset';
}

function startResetCountdown(seconds = 60) {
  resetCodeCountdown.value = seconds;
  if (resetCountdownTimer) clearInterval(resetCountdownTimer);
  resetCountdownTimer = setInterval(() => {
    resetCodeCountdown.value--;
    if (resetCodeCountdown.value <= 0) {
      clearInterval(resetCountdownTimer!);
      resetCountdownTimer = null;
    }
  }, 1000);
}

async function doSendResetCode() {
  resetError.value = '';
  const email = resetEmail.value.trim().toLowerCase();
  if (!email) { resetError.value = '请输入邮箱'; return; }
  resetCodeSending.value = true;
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, purpose: 'reset_password' }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK') {
      resetCodeSent.value = true;
      startResetCountdown(60);
    } else {
      resetError.value = json?.error || '发送失败，请稍后重试';
    }
  } catch {
    resetError.value = '网络异常，请稍后重试';
  } finally {
    resetCodeSending.value = false;
  }
}

async function doResetPassword() {
  resetError.value = '';
  resetSuccess.value = '';
  if (!resetEmail.value.trim()) { resetError.value = '请输入邮箱'; return; }
  if (!resetCodeSent.value || !resetCode.value.trim()) { resetError.value = '请先获取并填写验证码'; return; }
  if (resetNewPassword.value.length < 6) { resetError.value = '新密码至少 6 位'; return; }
  if (resetNewPassword.value !== resetNewPasswordConfirm.value) { resetError.value = '两次密码不一致'; return; }

  resetLoading.value = true;
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: resetEmail.value.trim().toLowerCase(),
        code: resetCode.value.trim(),
        new_password: resetNewPassword.value,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK') {
      resetSuccess.value = '密码重置成功！请使用新密码登录';
      setTimeout(() => { activeTab.value = 'login'; }, 1800);
    } else {
      resetError.value = json?.error || '重置失败，请稍后重试';
    }
  } catch {
    resetError.value = '网络异常，请稍后重试';
  } finally {
    resetLoading.value = false;
  }
}

// ---- helpers ----
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
  background: linear-gradient(135deg, #0d1117 0%, #161b22 60%, #1c2a3a 100%);
  overflow: hidden;
}

.auth-demo-iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  z-index: 0;
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
  padding: 0px 24px 64px 24px;
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

/* 品牌标题区（桌面端显示在登录卡顶部） */
.auth-card-brand-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ds-border-subtle);
}

.auth-card-brand-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.3));
}

.auth-card-brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.auth-card-brand-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  letter-spacing: 0.3px;
}

.auth-card-brand-sub {
  font-size: 13px;
  color: var(--ds-text-tertiary);
  margin: 0;
}

/* 功能亮点 */
.auth-features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  justify-content: center;
}

.auth-feature-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(77, 171, 247, 0.08);
  border: 1px solid rgba(77, 171, 247, 0.2);
  border-radius: 20px;
  font-size: 12px;
  color: var(--ds-text-secondary);
  transition: all 0.2s ease;
}

.auth-feature-item:hover {
  background: rgba(77, 171, 247, 0.15);
  border-color: rgba(77, 171, 247, 0.35);
  transform: translateY(-1px);
}

.auth-feature-icon {
  font-size: 14px;
}

.auth-feature-text {
  font-weight: 500;
  white-space: nowrap;
}

/* 移动端隐藏桌面品牌标题 */
@media (max-width: 768px) {
  .auth-card-brand-header {
    display: none;
  }

  .auth-features {
    display: none;
  }
}

/* 移动端 Logo（左侧隐藏时展示） */
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
  text-align: center;
}

.code-input::placeholder {
  text-align: center;
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
  background: linear-gradient(135deg, #4dabf7 0%, #339af0 100%);
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
  transition: all 0.2s ease;
  margin-top: 4px;
  box-shadow: 0 4px 14px rgba(77, 171, 247, 0.35);
}

.auth-submit-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #74c0fc 0%, #4dabf7 100%);
  box-shadow: 0 6px 20px rgba(77, 171, 247, 0.5);
  transform: translateY(-1px);
}

.auth-submit-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(77, 171, 247, 0.35);
}

.auth-submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
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

/* =====================================================
   Registration Two-Stage Flow
   ===================================================== */
.reg-stage1,
.reg-stage2 {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reg-verification-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  background: var(--ds-bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--ds-border-default);
}

.reg-verification-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}

.reg-verification-icon {
  color: var(--ds-success);
  flex-shrink: 0;
}

.reg-verification-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
}

.reg-verification-message {
  font-size: 13px;
  color: var(--ds-text-secondary);
  margin: 0;
  line-height: 1.5;
}

.reg-verification-message strong {
  color: var(--ds-text-primary);
  font-weight: 600;
}

.reg-stage2-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.reg-resend-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.reg-resend-btn,
.reg-back-btn {
  font-size: 12px;
  padding: 4px 8px;
}

.reg-resend-btn:disabled,
.reg-back-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* =====================================================
   Login footer (立即注册 + 忘记密码)
   ===================================================== */
.auth-login-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auth-forgot-btn {
  font-size: 12px;
  color: var(--ds-text-muted);
  text-decoration: none;
}

.auth-forgot-btn:hover {
  color: #4dabf7;
}

/* =====================================================
   Reset password header
   ===================================================== */
.auth-reset-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--ds-border-subtle);
  padding-bottom: 12px;
}

.auth-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--ds-text-tertiary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
}

.auth-back-btn:hover {
  color: #4dabf7;
}

.auth-reset-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ds-text-primary);
}
</style>
