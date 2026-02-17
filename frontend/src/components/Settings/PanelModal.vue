<template>
  <div v-if="showModal" class="console-modal-overlay" @click="closeModal">
    <div class="console-modal" @click.stop>
      <!-- Top Bar with Tabs -->
      <div class="console-topbar">
        <div class="console-tabs">
          <button 
            :class="['tab-btn', { active: activeTab === 'user' }]"
            @click="activeTab = 'user'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>用户管理</span>
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'about' }]"
            @click="activeTab = 'about'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>关于我们</span>
          </button>
          <button 
            :class="['tab-btn', { active: activeTab === 'debug' }]"
            @click="activeTab = 'debug'"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/>
            </svg>
            <span>开发工具</span>
          </button>
        </div>
        <button class="modal-close-btn" @click="closeModal" title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <!-- Tab Content -->
      <div class="console-tab-content">
        <!-- User Management Tab -->
        <div v-if="activeTab === 'user'" class="tab-panel">
          <!-- 未登录状态 -->
          <div v-if="!isAuthenticated" class="auth-section">
            <div class="auth-card">
              <div class="auth-header">
                <h3 class="auth-title">用户登录</h3>
                <p class="auth-subtitle">请输入您的账户信息</p>
              </div>
              
              <form @submit.prevent="handleLogin" class="auth-form">
                <div class="form-group">
                  <div class="input-wrapper">
                    <input
                      id="panel-username"
                      v-model="loginForm.username"
                      type="text"
                      class="form-input"
                      :class="{ 'input-error': loginError }"
                      placeholder="用户名"
                      autocomplete="username"
                      required
                    />
                  </div>
                </div>
                
                <div class="form-group">
                  <div class="input-wrapper">
                    <input
                      id="panel-password"
                      v-model="loginForm.password"
                      :type="showLoginPassword ? 'text' : 'password'"
                      class="form-input"
                      :class="{ 'input-error': loginError }"
                      placeholder="密码"
                      autocomplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      class="password-toggle"
                      @click="showLoginPassword = !showLoginPassword"
                      :title="showLoginPassword ? '隐藏密码' : '显示密码'"
                    >
                      <svg v-if="showLoginPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div v-if="loginError" class="error-message">
                  {{ loginError }}
                </div>
                
                <button
                  type="submit"
                  class="auth-button"
                  :disabled="loginLoading"
                >
                  <span v-if="loginLoading" class="button-loading">
                    <span class="loading-spinner"></span>
                    登录中...
                  </span>
                  <span v-else>登录</span>
                </button>
              </form>
            </div>
          </div>
          
          <!-- 已登录状态 -->
          <div v-else class="user-profile-section">
            <div class="profile-card">
              <div class="profile-header">
                <div class="avatar-placeholder">
                  <img 
                    src="/icons/user.svg" 
                    alt="User Avatar" 
                    class="user-avatar"
                    width="40" 
                    height="40"
                  />
                </div>
                <div class="user-info">
                  <div class="username-row">
                    <h3 class="username">{{ currentUser?.username }}</h3>
                    <span v-if="currentUser?.role === 'pro'" class="profile-role-badge profile-role-badge-pro">pro</span>
                    <span v-else-if="currentUser?.role === 'pro+'" class="profile-role-badge profile-role-badge-proplus">pro+</span>
                  </div>
                  <p class="user-id">ID: {{ currentUser?.uid }}</p>
                </div>
              </div>
              
              <div class="profile-actions">
                <button
                  type="button"
                  class="secondary-button"
                  @click="showChangePassword = true"
                >
                  修改密码
                </button>
                <button
                  type="button"
                  class="danger-button"
                  :disabled="logoutLoading"
                  @click="handleLogout"
                >
                  <span v-if="logoutLoading" class="button-loading">
                    <span class="loading-spinner"></span>
                    退出中...
                  </span>
                  <span v-else>退出登录</span>
                </button>
              </div>
            </div>

            <div class="title-divider"></div>
            
            <!-- 修改密码表单 -->
            <div v-if="showChangePassword" class="change-password-section">
              <div class="password-card">
                <h4 class="password-title">修改密码</h4>
                
                <form @submit.prevent="handleChangePassword" class="password-form">
                  <div class="form-group">
                    <div class="input-wrapper">
                      <input
                        id="old-password"
                        v-model="passwordForm.oldPassword"
                        :type="showOldPassword ? 'text' : 'password'"
                        class="form-input"
                        :class="{ 'input-error': passwordError }"
                        placeholder="当前密码"
                        required
                      />
                      <button
                        type="button"
                        class="password-toggle"
                        @click="showOldPassword = !showOldPassword"
                      >
                        <svg v-if="showOldPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <div class="input-wrapper">
                      <input
                        id="new-password"
                        v-model="passwordForm.newPassword"
                        :type="showNewPassword ? 'text' : 'password'"
                        class="form-input"
                        :class="{ 'input-error': passwordError }"
                        placeholder="新密码"
                        required
                      />
                      <button
                        type="button"
                        class="password-toggle"
                        @click="showNewPassword = !showNewPassword"
                      >
                        <svg v-if="showNewPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <div class="input-wrapper">
                      <input
                        id="confirm-password"
                        v-model="passwordForm.confirmPassword"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        class="form-input"
                        :class="{ 'input-error': passwordError }"
                        placeholder="确认新密码"
                        required
                      />
                      <button
                        type="button"
                        class="password-toggle"
                        @click="showConfirmPassword = !showConfirmPassword"
                      >
                        <svg v-if="showConfirmPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  <div v-if="passwordError" class="error-message">
                    {{ passwordError }}
                  </div>
                  
                  <div v-if="passwordSuccess" class="success-message">
                    {{ passwordSuccess }}
                  </div>
                  
                  <div class="form-actions">
                    <button
                      type="button"
                      class="secondary-button"
                      @click="showChangePassword = false"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      class="primary-button"
                      :disabled="passwordLoading"
                    >
                      <span v-if="passwordLoading" class="button-loading">
                        <span class="loading-spinner"></span>
                        修改中...
                      </span>
                      <span v-else>确认修改</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <!-- About Us Tab -->
        <div v-if="activeTab === 'about'" class="tab-panel">
          <div class="about-content">
            <p class="about-featured">这是雪豹</p>
            <p class="about-developed-by">Developed by Snowbo</p>
            <div class="title-divider"></div>
            <div class="version-section">
              <div class="version-row">
                <span class="version-label">Frontend Replayer</span>
                <span class="version-value">{{ FRONTEND_VERSION }}</span>
              </div>
              <div class="version-row">
                <span class="version-label">Engine Compat</span>
                <span class="version-value">{{ COMPATIBLE_ENGINE_VERSIONS.join(', ') }}</span>
              </div>
            </div>
            <div class="social-section">
              <h4 class="social-title">关注我们 & 意见反馈</h4>
              <ul class="social-list">
                <li class="social-item">抖音 @2#777</li>
                <li class="social-item">小红书 @...</li>
                <li class="social-item">bilibili @...</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Debug Tools Tab -->
        <div v-if="activeTab === 'debug'" class="tab-panel">
          <div class="warning-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>不要随意修改此页面中的配置，否则可能导致致命错误</span>
          </div>
          
          <!-- Storage Quota Display -->
          <div v-if="DEBUG_CONFIG.enableStorageQuotaDisplay" class="storage-quota-section">
            <div class="storage-quota-container">
              <div class="storage-quota-card">
                <div class="quota-header">
                  <svg class="quota-icon" width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor">
                    <path d="M952.288 697.312l-108.352-467.2a83.424 83.424 0 0 0-26.944-49.344c-14.4-12.8-32.768-20.128-51.968-20.768H257.472c-40.256 1.568-72.768 32.704-78.944 71.68L70.208 697.28c-4.64 12.48-6.208 26.528-6.208 38.976C64 806.368 121.28 864 192.48 864h639.072C902.784 864 960 806.368 960 736.288c0-12.48-3.072-26.496-7.712-38.976z m-120.736 104.384H192.48a62.464 62.464 0 0 1-45.12-18.496 63.168 63.168 0 0 1-18.368-45.344c0-35.84 29.44-63.904 63.488-63.904h639.072c35.616 0 63.456 28.064 63.456 63.904 1.568 34.24-27.84 63.84-63.456 63.84z m-32.48-84.128a21.6 21.6 0 0 0-21.664 18.72 21.76 21.76 0 0 0 18.56 21.76h3.104a20.544 20.544 0 0 0 20.128-20.192c0-12.48-7.744-20.288-20.128-20.288z m-41.792 20.288c0-23.36 18.56-42.048 41.792-42.048 23.2 0 41.792 18.688 41.792 42.048 0 23.36-18.56 42.048-41.792 42.048a41.728 41.728 0 0 1-41.792-42.048z" fill="currentColor"></path>
                  </svg>
                  <h3 class="quota-title">OPFS Storage Quota</h3>
                </div>
                
                <div class="quota-details">
                  <div class="quota-info-row">
                    <span class="quota-label">Used:</span>
                    <span class="quota-value">{{ storageUsedText }}</span>
                  </div>
                  <div class="quota-info-row">
                    <span class="quota-label">Total:</span>
                    <span class="quota-value">{{ storageQuotaText }}</span>
                  </div>
                  
                  <div class="quota-progress-container">
                    <div class="quota-progress-bar">
                      <div 
                        class="quota-progress-fill" 
                        :class="{ 
                          'storage-warning': storageUsagePercent >= 80 && storageUsagePercent < 95,
                          'storage-critical': storageUsagePercent >= 95
                        }"
                        :style="{ width: `${storageUsagePercent}%` }"
                      ></div>
                    </div>
                    <div class="quota-percentage">{{ storageUsagePercent }}%</div>
                  </div>
                </div>
              </div>
              
              <!-- WASM Memory Section -->
              <div class="wasm-memory-card">
                <div class="quota-header">
                  <svg class="quota-icon" width="16" height="16" viewBox="0 0 1024 1024">
                    <path d="M863.438 280.125h-704c-17.673 0-32 14.327-32 32v447.059c0 17.673 14.327 32 32 32h127.809c17.673 0 32-14.327 32-32V732.36h42.718v56.375h64V732.36h51.947v56.375h64V732.36h51.947v56.375h64V732.36h45.608v26.823c0 17.673 14.327 32 32 32h127.971c17.673 0 32-14.327 32-32V312.125c0-17.673-14.328-32-32-32z m-32 295.333h-33.559c-17.673 0-32 14.327-32 32s14.327 32 32 32h33.559v87.726h-63.971V700.36c0-17.673-14.327-32-32-32H287.246c-17.673 0-32 14.327-32 32v26.823h-63.809v-87.726h32.559c17.673 0 32-14.327 32-32s-14.327-32-32-32h-32.559V344.125h640v231.333z" fill="currentColor"></path>
                    <path d="M256.477 395.557h80.279v140h-80.279zM400.89 395.557h80.279v140H400.89zM545.302 395.557h80.279v140h-80.279zM689.715 395.557h80.279v140h-80.279z" fill="currentColor"></path>
                  </svg>
                  <h3 class="quota-title">JS Memory Quota</h3>
                </div>
                
                <div class="quota-details">
                  <div class="quota-info-row">
                    <span class="quota-label">Used:</span>
                    <span class="quota-value">{{ wasmMemoryUsedText }}</span>
                  </div>
                  <div class="quota-info-row">
                    <span class="quota-label">Total:</span>
                    <span class="quota-value">{{ wasmMemoryLimitText }}</span>
                  </div>
                  
                  <!-- Progress bar and percentage (only shown when valid limit exists) -->
                  <div v-if="wasmMemoryLimit && wasmMemoryLimit > 0" class="quota-progress-container">
                    <div class="quota-progress-bar">
                      <div class="quota-progress-fill" :style="{ width: wasmMemoryPercent + '%' }"></div>
                    </div>
                    <div class="quota-percentage">{{ wasmMemoryPercent }}%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 左侧纵排：两个输入框；右侧纵排：三个按钮 -->
          <div class="debug-tools-layout">
            <div class="debug-options-left">
              <div
                v-if="DEBUG_CONFIG.enableRoundLimitConfig"
                class="parse-option-cell"
              >
                <div class="input-group">
                  <label class="input-label">Parse Round Limit</label>
                  <input
                    v-model.number="roundLimit"
                    type="number"
                    min="1"
                    class="ds-input round-limit-input"
                    @change="saveRoundLimit"
                  />
                </div>
              </div>
              <div
                v-if="DEBUG_CONFIG.enableParseFrameRatioConfig"
                class="parse-option-cell"
              >
                <div class="input-group">
                  <label class="input-label">Parse Frame Ratio</label>
                  <input
                    v-model.number="parseFrameRatio"
                    type="number"
                    min="1"
                    class="ds-input round-limit-input"
                    @change="saveParseFrameRatio"
                  />
                </div>
              </div>
              <div
                v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
                class="parse-option-cell"
              >
                <div class="input-group">
                  <label class="input-label">Max Surge Demo Num</label>
                  <input
                    v-model.number="maxSurgeDemoNum"
                    type="number"
                    min="0"
                    class="ds-input round-limit-input"
                    @change="saveMaxSurgeDemoNum"
                  />
                </div>
              </div>
            </div>
            <div class="debug-actions-right">
              <div class="button-group">
                <button
                  v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
                  class="ds-btn ds-btn-console"
                  @click="handleOPFSViewer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>OPFS Viewer</span>
                </button>
                <button
                  v-if="DEBUG_CONFIG.enableOPFSStorageViewer"
                  class="ds-btn ds-btn-console"
                  :disabled="cleaningStorage"
                  @click="handleCleanStorageLeak"
                >
                  <svg v-if="cleaningStorage" class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.22-8.56"/>
                  </svg>
                  <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                  <span>{{ cleaningStorage ? 'cleaning…' : 'Cleanup StorLeak' }}</span>
                </button>
              </div>
              <button
                v-if="DEBUG_CONFIG.enableFrameDataViewer"
                class="ds-btn ds-btn-console"
                @click="handleFrameDataViewer"
                :disabled="!(currentPage === 'player')"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <span>Frame Viewer</span>
              </button>
            </div>
          </div>
          <p v-if="cleanupMessage" class="cleanup-message" :class="cleanupMessageType">
            {{ cleanupMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import {
  DEBUG_CONFIG,
  PARSING_ROUND_LIMIT_KEY,
  PARSING_ROUND_LIMIT_DEFAULT,
  PARSE_FRAME_RATIO_KEY,
  PARSE_FRAME_RATIO_DEFAULT,
  MAX_SURGE_DEMO_NUM_KEY,
  MAX_SURGE_DEMO_NUM_DEFAULT,
} from '@/config/debug';
import { FRONTEND_VERSION, COMPATIBLE_ENGINE_VERSIONS } from '@/config/version';
import { cleanupOrphanedReplayStorage } from '@/composables/opfs-storage';
import { useAuth } from '@/composables/useAuth';

interface Props {
  showModal: boolean;
  currentPage: 'library' | 'player' | 'notes';
}

interface Emits {
  (e: 'close'): void;
  (e: 'open-frame-data-viewer'): void;
  (e: 'open-opfs-viewer'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const activeTab = ref<'user' | 'about' | 'debug'>('user');

// 打开 modal 时优先选中用户管理 tab
watch(() => props.showModal, (visible) => {
  if (visible) activeTab.value = 'user';
});

// 用户认证相关
const { currentUser, fetchAuthMe: fetchAuthMeShared, setUser, clearUser, handleSessionExpired } = useAuth();
const isAuthenticated = computed(() => !!currentUser.value);

// 登录表单
interface LoginForm {
  username: string;
  password: string;
}

const loginForm = ref<LoginForm>({ username: '', password: '' });
const loginError = ref('');
const loginLoading = ref(false);
const showLoginPassword = ref(false);

// 修改密码表单
interface PasswordForm {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const showChangePassword = ref(false);
const passwordForm = ref<PasswordForm>({ 
  oldPassword: '', 
  newPassword: '', 
  confirmPassword: '' 
});
const passwordError = ref('');
const passwordSuccess = ref('');
const passwordLoading = ref(false);
const showOldPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

// 登出相关
const logoutLoading = ref(false);

// 登录处理
const handleLogin = async () => {
  const { username, password } = loginForm.value;
  
  if (!username.trim()) {
    loginError.value = '请输入用户名';
    return;
  }
  
  if (!password) {
    loginError.value = '请输入密码';
    return;
  }
  
  loginLoading.value = true;
  loginError.value = '';
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: username.trim(), password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.status === 'OK') {
      setUser({ uid: data.data.uid, username: data.data.username });
      loginForm.value = { username: '', password: '' };
      showLoginPassword.value = false;
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '登录成功', type: 'info' } }));
      window.location.reload();
    } else {
      loginError.value = data.error || '登录失败';
    }
  } catch (error) {
    loginError.value = '网络错误，请重试';
  } finally {
    loginLoading.value = false;
  }
};

// 登出处理
const handleLogout = async () => {
  logoutLoading.value = true;
  
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    clearUser();
    showChangePassword.value = false;
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已退出登录', type: 'info' } }));
    window.location.reload();
  } catch (error) {
    // 即使出错也清除本地状态
    clearUser();
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已退出登录', type: 'info' } }));
    window.location.reload();
  } finally {
    logoutLoading.value = false;
  }
};

// 修改密码处理
const handleChangePassword = async () => {
  const { oldPassword, newPassword, confirmPassword } = passwordForm.value;
  
  if (!oldPassword) {
    passwordError.value = '请输入当前密码';
    return;
  }
  
  if (!newPassword) {
    passwordError.value = '请输入新密码';
    return;
  }
  
  if (newPassword.length < 6) {
    passwordError.value = '新密码至少需要6位字符';
    return;
  }
  
  if (newPassword !== confirmPassword) {
    passwordError.value = '两次输入的密码不一致';
    return;
  }
  
  passwordLoading.value = true;
  passwordError.value = '';
  passwordSuccess.value = '';
  
  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        old_password: oldPassword, 
        new_password: newPassword 
      })
    });
    
    const data = await response.json();
    
    if (response.status === 401) {
      handleSessionExpired();
      showChangePassword.value = false;
      return;
    }
    if (response.ok && data.status === 'OK') {
      passwordForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
      showOldPassword.value = false;
      showNewPassword.value = false;
      showConfirmPassword.value = false;
      showChangePassword.value = false;
      // 后端已清理该用户全部 session 并清除 cookie，前端同步退出登录并提示
      clearUser();
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '密码已修改，请重新登录', type: 'info' } }));
      window.location.reload();
    } else {
      passwordError.value = data.error || '密码修改失败';
    }
  } catch (error) {
    passwordError.value = '网络错误，请重试';
  } finally {
    passwordLoading.value = false;
  }
};

// 登录状态由 main.ts 的 initAuth() 统一在首屏前拉取，此处不再 onMounted 请求，避免刷新时 me 重复请求

// Password change functionality is now handled by UserAuth component



// Storage quota tracking
const storageUsed = ref(0);
const storageQuota = ref(0);

const storageUsagePercent = computed(() => {
  if (storageQuota.value === 0) return 0;
  return Math.min(100, Math.round((storageUsed.value / storageQuota.value) * 100));
});

const storageUsedText = computed(() => {
  const mb = storageUsed.value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

const storageQuotaText = computed(() => {
  const mb = storageQuota.value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

// WASM memory tracking
const wasmMemoryUsed = ref(0);
const wasmMemoryLimit = ref(0); // Dynamic limit from browser
const wasmMemorySupported = ref(false);

const wasmMemoryPercent = computed(() => {
  if (wasmMemoryLimit.value === 0) return 0;
  return Math.min(100, Math.round((wasmMemoryUsed.value / wasmMemoryLimit.value) * 100));
});

const wasmMemoryUsedText = computed(() => {
  if (!wasmMemorySupported.value) {
    return 'N/A';
  }
  const mb = wasmMemoryUsed.value / (1024 * 1024);
  if (mb < 1) {
    return `${(mb * 1024).toFixed(0)} KB`;
  }
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

const wasmMemoryLimitText = computed(() => {
  if (!wasmMemorySupported.value) {
    return 'N/A';
  }
  const mb = wasmMemoryLimit.value / (1024 * 1024);
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${(mb / 1024).toFixed(2)} GB`;
});

// Fetch storage quota
const updateStorageQuota = async () => {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      storageUsed.value = estimate.usage || 0;
      storageQuota.value = estimate.quota || 0;
    } catch (error) {
      console.warn('[Storage Quota] Failed to fetch storage estimate:', error);
    }
  }
};

// Round limit / parse frame ratio / max surge: keys and defaults from @/config/debug
const roundLimit = ref<number>(PARSING_ROUND_LIMIT_DEFAULT);
const parseFrameRatio = ref<number>(PARSE_FRAME_RATIO_DEFAULT);
const maxSurgeDemoNum = ref<number>(MAX_SURGE_DEMO_NUM_DEFAULT);

// Real-time update for usage info when debug tab is open (1s refresh)
watch(activeTab, (tab) => {
  // Restore auth state when opening user tab
  if (tab === 'user') {
    // User management is handled by UserModal component
  }

  // Clear existing interval when leaving debug tab
  if (memoryUpdateInterval !== null) {
    clearInterval(memoryUpdateInterval);
    memoryUpdateInterval = null;
  }
  
  if (DEBUG_CONFIG.enableStorageQuotaDisplay && tab === 'debug') {
    // Initial update
    updateStorageQuota();
    updateWasmMemory();
    
    // Update both storage and WASM usage every 1 second
    memoryUpdateInterval = window.setInterval(() => {
      updateStorageQuota();
      updateWasmMemory();
    }, 1000);
  }
});

// Load round limit and parse frame ratio from localStorage on component mount
onMounted(() => {
  // Load round limit from localStorage (must be > 0, default 999)
  if (DEBUG_CONFIG.enableRoundLimitConfig) {
    const savedLimit = localStorage.getItem(PARSING_ROUND_LIMIT_KEY);
    if (savedLimit !== null) {
      const parsedLimit = parseInt(savedLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        roundLimit.value = Math.floor(parsedLimit);
      }
    }
  }

  // Load maxSurgeDemoNum from localStorage (default 32)
  if (DEBUG_CONFIG.enableOPFSStorageViewer) {
    const savedSurge = localStorage.getItem(MAX_SURGE_DEMO_NUM_KEY);
    if (savedSurge !== null) {
      const n = parseInt(savedSurge, 10);
      if (!isNaN(n) && n >= 0) maxSurgeDemoNum.value = n;
    }
  }

  // Load parse frame ratio from localStorage (must be > 0, default 2)
  if (DEBUG_CONFIG.enableParseFrameRatioConfig) {
    const saved = localStorage.getItem(PARSE_FRAME_RATIO_KEY);
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 1) {
        parseFrameRatio.value = Math.max(1, Math.floor(n));
      }
    }
  }
});

// Update WASM memory usage
const updateWasmMemory = () => {
  try {
    // Check if performance.memory is available (Chrome/Edge only)
    if ('memory' in performance) {
      wasmMemorySupported.value = true;
      const mem = (performance as any).memory;
      
      // Use totalJSHeapSize to include Go WASM memory
      const totalUsed = mem.totalJSHeapSize || mem.usedJSHeapSize || 0;
      const currentLimit = mem.jsHeapSizeLimit;
      
      // Only set values if we have a valid limit (no fallback)
      if (currentLimit && currentLimit > 0) {
        wasmMemoryUsed.value = totalUsed;
        wasmMemoryLimit.value = currentLimit;
        
        // Log warning if memory is high
        const percent = (totalUsed / currentLimit) * 100;
        if (percent >= 75) {
          console.warn(`[WASM Memory] High memory usage: ${(totalUsed / (1024 * 1024)).toFixed(1)} MB (${percent.toFixed(1)}%)`);
        }
      } else {
        // No valid limit - set to 0 to show N/A
        wasmMemoryUsed.value = totalUsed;
        wasmMemoryLimit.value = 0;
      }
    } else {
      wasmMemorySupported.value = false;
      wasmMemoryUsed.value = 0;
      wasmMemoryLimit.value = 0;
      console.debug('[WASM Memory] performance.memory API not available (use Chrome/Edge for accurate measurement)');
    }
  } catch (error) {
    wasmMemorySupported.value = false;
    wasmMemoryUsed.value = 0;
    wasmMemoryLimit.value = 0;
    console.warn('[WASM Memory] Failed to fetch memory stats:', error);
  }
};

// Save round limit to localStorage (must be > 0 integer)
const saveRoundLimit = () => {
  const v = Math.floor(Number(roundLimit.value));
  if (typeof roundLimit.value !== 'number' || isNaN(roundLimit.value) || v < 1) {
    roundLimit.value = PARSING_ROUND_LIMIT_DEFAULT;
    localStorage.setItem(PARSING_ROUND_LIMIT_KEY, String(PARSING_ROUND_LIMIT_DEFAULT));
  } else {
    roundLimit.value = v;
    localStorage.setItem(PARSING_ROUND_LIMIT_KEY, String(v));
  }
};

// Clear round limit (reset to default)
const clearRoundLimit = () => {
  roundLimit.value = PARSING_ROUND_LIMIT_DEFAULT;
  localStorage.setItem(PARSING_ROUND_LIMIT_KEY, String(PARSING_ROUND_LIMIT_DEFAULT));
};

// Save parse frame ratio to localStorage (must be > 0 integer)
const saveParseFrameRatio = () => {
  let v = parseFrameRatio.value;
  if (typeof v !== 'number' || isNaN(v) || v < 1) {
    v = PARSE_FRAME_RATIO_DEFAULT;
    parseFrameRatio.value = PARSE_FRAME_RATIO_DEFAULT;
  } else {
    v = Math.max(1, Math.floor(v));
    parseFrameRatio.value = v;
  }
  localStorage.setItem(PARSE_FRAME_RATIO_KEY, String(v));
};

// Save maxSurgeDemoNum to localStorage (non-negative integer)
const saveMaxSurgeDemoNum = () => {
  let v = maxSurgeDemoNum.value;
  if (typeof v !== 'number' || isNaN(v) || v < 0) {
    v = MAX_SURGE_DEMO_NUM_DEFAULT;
    maxSurgeDemoNum.value = MAX_SURGE_DEMO_NUM_DEFAULT;
  } else {
    v = Math.max(0, Math.floor(v));
    maxSurgeDemoNum.value = v;
  }
  localStorage.setItem(MAX_SURGE_DEMO_NUM_KEY, String(v));
};

let memoryUpdateInterval: number | null = null;

onUnmounted(() => {
  if (memoryUpdateInterval !== null) {
    clearInterval(memoryUpdateInterval);
  }
});

const closeModal = () => {
  emit('close');
};

const handleFrameDataViewer = () => {
  emit('close');
  emit('open-frame-data-viewer');
};

const handleOPFSViewer = () => {
  emit('close');
  emit('open-opfs-viewer');
};

// Clean Storage Leak: remove OPFS dirs that have no meta in IndexedDB
const cleaningStorage = ref(false);
const cleanupMessage = ref('');
const cleanupMessageType = ref<'success' | 'error' | 'info'>('info');
let cleanupMessageTimer: ReturnType<typeof setTimeout> | null = null;

const handleCleanStorageLeak = async () => {
  cleaningStorage.value = true;
  cleanupMessage.value = '';
  if (cleanupMessageTimer) {
    clearTimeout(cleanupMessageTimer);
    cleanupMessageTimer = null;
  }
  try {
    const surge = Math.max(0, Math.floor(Number(maxSurgeDemoNum.value))) || MAX_SURGE_DEMO_NUM_DEFAULT;
    const result = await cleanupOrphanedReplayStorage(surge);
    if (result.count === 0) {
      cleanupMessage.value = '没有发现泄露（所有 OPFS 目录均有对应 IndexedDB meta）';
      cleanupMessageType.value = 'info';
    } else {
      cleanupMessage.value = `已清理 ${result.count} 个泄露目录`;
      cleanupMessageType.value = 'success';
      await updateStorageQuota();
    }
    cleanupMessageTimer = setTimeout(() => {
      cleanupMessage.value = '';
      cleanupMessageTimer = null;
    }, 5000);
  } catch (err: any) {
    cleanupMessage.value = err?.message || '清理失败';
    cleanupMessageType.value = 'error';
    cleanupMessageTimer = setTimeout(() => {
      cleanupMessage.value = '';
      cleanupMessageTimer = null;
    }, 5000);
  } finally {
    cleaningStorage.value = false;
  }
};
</script>

<style scoped>
.console-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5); /* More transparent background */
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.console-modal {
  max-width: 600px;
  width: 90vw;
  min-height: 400px;
  height: 70vh;
  max-height: 600px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  animation: slideUp 0.3s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.console-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-lg) var(--ds-space-xl);
  border-bottom: 1px solid var(--ds-border-default);
  background: var(--ds-bg-elevated);
}

.console-tabs {
  display: flex;
  gap: var(--ds-space-sm);
  flex: 1;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-sm);
  padding: var(--ds-space-sm);
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  min-width: 80px;
}

.tab-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.tab-btn.active {
  background: var(--ds-surface-active);
  color: var(--ds-primary);
  border-radius: var(--ds-radius-md);
}

.tab-btn.active svg {
  stroke: var(--ds-primary);
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: var(--ds-space-sm);
}

.modal-close-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.modal-close-btn:active {
  transform: scale(0.95);
}

.console-tab-content {
  flex: 1;
  padding: var(--ds-space-xl);
  overflow-y: auto;
}

.tab-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.title-divider {
  width: 100%;
  height: 1px;
  background: var(--ds-border-default);
  margin: var(--ds-space-md) 0;
}

.warning-notice {
  width: 100%;
  padding: var(--ds-space-sm);
  background: rgba(245, 158, 11, 0.15); /* amber with low opacity */
  border: 1px solid var(--ds-warning);
  border-radius: var(--ds-radius-md);
  color: var(--ds-warning);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
}

.modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-lg);
  font-weight: 700;
}

.modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 500;
  line-height: 1.6;
  text-align: center;
}

.user-logged-in,
.user-login-form {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  padding: var(--ds-space-lg);
}

.user-logged-in {
  border-bottom: 1px solid var(--ds-border-default);
}

/* 用户面板占位符样式 */
.user-panel-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: var(--ds-space-xl);
}

.user-panel-content {
  text-align: center;
  max-width: 300px;
}

.user-icon {
  color: var(--ds-text-secondary);
  margin-bottom: var(--ds-space-lg);
}

.user-panel-title {
  font-size: var(--ds-text-xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-sm);
}

.user-panel-description {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin: 0 0 var(--ds-space-lg);
  line-height: 1.5;
}

/* 内嵌用户管理样式 */
.auth-section,
.user-profile-section {
  padding: var(--ds-space-lg);
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.auth-card,
.profile-card,
.password-card {
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-lg);
  width: 100%;
}

.auth-header {
  text-align: center;
  margin-bottom: var(--ds-space-md);
}

.auth-title {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-xs);
}

.auth-subtitle {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-secondary);
  margin: 0;
}

.auth-form,
.password-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  width: 100%;
}

.form-group {
  display: flex;
  flex-direction: column;
  width: 100%;
}



.input-wrapper {
  position: relative;
  width: 100%;
}

.form-input {
  width: 100%;
  padding: var(--ds-space-sm);
  background: var(--ds-surface-base);
  border: 2px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-family: var(--ds-font-sans);
  outline: none;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

/* 仅密码框右侧留空给眼睛图标 */
.input-wrapper:has(.password-toggle) .form-input {
  padding-right: 40px;
}

.form-input:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.2);
  background: var(--ds-surface-hover);
}

.form-input.input-error {
  border-color: var(--ds-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.password-toggle {
  position: absolute;
  right: var(--ds-space-sm);
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--ds-text-tertiary);
  cursor: pointer;
  padding: var(--ds-space-xxs);
  border-radius: var(--ds-radius-sm);
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.password-toggle:hover {
  color: var(--ds-text-primary);
  background: var(--ds-surface-hover);
}

.auth-button,
.primary-button,
.secondary-button,
.danger-button {
  width: 100%;
  padding: var(--ds-space-sm);
  border: none;
  border-radius: var(--ds-radius-md);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-xs);
  min-height: 40px;
}

.auth-button,
.primary-button {
  background: var(--ds-primary);
  color: var(--ds-primary-text);
}

.auth-button:hover:not(:disabled),
.primary-button:hover:not(:disabled) {
  background: var(--ds-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--ds-shadow-md);
}

.secondary-button {
  background: var(--ds-surface-base);
  color: var(--ds-text-primary);
  border: 1px solid var(--ds-border-default);
}

.secondary-button:hover:not(:disabled) {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-hover);
}

.danger-button {
  background: var(--ds-danger);
  color: var(--ds-danger-text);
}

.danger-button:hover:not(:disabled) {
  background: var(--ds-danger-hover);
  transform: translateY(-1px);
  box-shadow: var(--ds-shadow-md);
}

.auth-button:disabled,
.primary-button:disabled,
.secondary-button:disabled,
.danger-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.error-message {
  padding: var(--ds-space-sm);
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--ds-radius-md);
  color: var(--ds-danger);
  font-size: var(--ds-text-sm);
  text-align: center;
}

.success-message {
  padding: var(--ds-space-sm);
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: var(--ds-radius-md);
  color: var(--ds-success);
  font-size: var(--ds-text-sm);
  text-align: center;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-md);
  width: 100%;
}

.avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--ds-surface-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ds-text-secondary);
  flex-shrink: 0;
  overflow: hidden;
}

.user-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.username-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-xxs);
  min-width: 0;
}

.username {
  font-size: var(--ds-text-base);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-role-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px 4px 6px; /* 下边距略大，补偿 pro 的 p 下伸，视觉居中 */
  border-radius: 4px;
}

.profile-role-badge-pro {
  background: rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.profile-role-badge-proplus {
  background: rgba(234, 179, 8, 0.35);
  color: #eab308;
}

.user-id {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-secondary);
  margin-top: var(--ds-space-xs);
  font-family: var(--ds-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  width: 100%;
}

.change-password-section {
  margin-top: var(--ds-space-md);
  width: 100%;
}

.password-title {
  font-size: var(--ds-text-base);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-sm);
  text-align: center;
}

.form-actions {
  display: flex;
  gap: var(--ds-space-xs);
  margin-top: var(--ds-space-sm);
  width: 100%;
}

.button-loading {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 响应式设计 */
@media (max-width: 480px) {
  .auth-section,
  .user-profile-section {
    padding: var(--ds-space-md);
  }
  
  .auth-card,
  .profile-card,
  .password-card {
    padding: var(--ds-space-lg);
  }
  
  .form-actions {
    flex-direction: column;
  }
}

.user-logged-in-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.user-summary {
  margin: 0;
  font-size: var(--ds-text-base);
  color: var(--ds-text-primary);
  font-weight: 600;
  text-align: center;
  padding: var(--ds-space-sm);
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-border-subtle);
}

.user-label {
  color: var(--ds-text-secondary);
  margin-right: var(--ds-space-sm);
  font-weight: 500;
}

.user-uid {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  margin-left: var(--ds-space-sm);
  font-family: var(--ds-font-mono);
  font-weight: 400;
}

.login-error {
  margin: 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-danger);
  padding: var(--ds-space-xs) var(--ds-space-sm);
  background: rgba(239, 68, 68, 0.15);
  border-radius: var(--ds-radius-md);
  border: 1px solid rgba(239, 68, 68, 0.3);
  text-align: center;
}

.user-change-password {
  width: 100%;
  max-width: 320px;
  margin-top: var(--ds-space-lg);
  padding: var(--ds-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
  border-top: 1px solid var(--ds-border-default);
}

.change-password-title {
  margin: 0 0 var(--ds-space-sm) 0;
  font-size: var(--ds-text-base);
  font-weight: 700;
  color: var(--ds-text-primary);
  text-align: center;
  padding: var(--ds-space-sm) 0;
}

.change-password-success {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-success);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: rgba(16, 185, 129, 0.15);
  border-radius: var(--ds-radius-md);
  border: 1px solid rgba(16, 185, 129, 0.3);
  text-align: center;
  font-weight: 500;
}

.login-info-message {
  margin: 0 0 var(--ds-space-sm) 0;
  font-size: var(--ds-text-xs);
  color: var(--ds-success);
  padding: var(--ds-space-xs) var(--ds-space-sm);
  background: rgba(16, 185, 129, 0.15);
  border-radius: var(--ds-radius-md);
  border: 1px solid rgba(16, 185, 129, 0.3);
  text-align: center;
  font-weight: 500;
}

.about-content {
  width: 100%;
  text-align: center;
}

.about-featured {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: var(--ds-space-md) 0 var(--ds-space-xs) 0;
}

.about-developed-by {
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: var(--ds-space-xs) 0 var(--ds-space-2xl) 0;
}

.version-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  margin-top: var(--ds-space-md);
}

.version-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
}

.version-label {
  color: var(--ds-text-tertiary);
  font-weight: 500;
}

.version-value {
  color: var(--ds-text-secondary);
  font-weight: 600;
  font-family: monospace;
}

.social-section {
  margin-top: var(--ds-space-xl);
}

.social-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-md) 0;
}

.social-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.social-item {
  padding: var(--ds-space-sm);
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  text-align: center;
}

.modal-actions-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  width: 100%;
  max-width: 300px;
}

.ds-btn-console {
  width: 100%;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-primary);
  border: none;
  border-radius: var(--ds-radius-md);
  color: var(--ds-primary-text);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-sm);
  font-family: var(--ds-font-sans);
  box-shadow: var(--ds-shadow-sm);
}

.ds-btn-console:hover:not(:disabled) {
  background: var(--ds-primary-hover);
  transform: translateY(-2px);
  box-shadow: var(--ds-shadow-md);
}

.ds-btn-console svg {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

/* Storage Quota Styles */
.storage-quota-section {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  width: 100%;
  margin-bottom: var(--ds-space-sm);
}

.storage-quota-container {
  display: flex;
  gap: var(--ds-space-sm);
}

.storage-quota-card,
.wasm-memory-card {
  flex: 1;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-sm);
}

/* 开发工具区域：输入框左侧 50%，按钮右侧 50%，各占一半 */
.debug-tools-layout {
  display: flex;
  align-items: flex-start;
  gap: var(--ds-space-sm);
  width: 100%;
}

.debug-options-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  align-items: stretch;
}

.debug-actions-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  align-items: stretch;
}

/* Button group: vertical stacking, buttons fill column width */
.button-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  align-items: stretch;
  width: 100%;
}

/* 按钮与输入卡片同宽度，允许纵向堆叠两个按钮 */
.debug-actions-right .ds-btn-console {
  width: 100%;
  min-width: 0;
  padding: var(--ds-space-sm);
  height: 37px;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-sm);
  box-sizing: border-box;
}

.debug-actions-right .ds-btn-console svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.cleanup-message {
  margin-top: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  padding: var(--ds-space-sm);
  border-radius: var(--ds-radius-sm);
}
.cleanup-message.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}
.cleanup-message.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}
.cleanup-message.info {
  background: rgba(74, 171, 247, 0.15);
  color: #4dabf7;
}

.spin {
  animation: cleanup-spin 0.8s linear infinite;
}
@keyframes cleanup-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.quota-header {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-sm);
}

.quota-icon {
  flex-shrink: 0;
}

.quota-title {
  margin: 0;
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.quota-details {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  padding-left: calc(16px + var(--ds-space-sm)); /* Account for icon width */
}

.quota-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
}

.quota-label {
  font-weight: 500;
}

.quota-value {
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-left: var(--ds-space-sm);
}

.quota-progress-container {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-top: var(--ds-space-sm);
}

.quota-progress-bar {
  flex: 1;
  height: 8px;
  background: var(--ds-surface-base);
  border-radius: 4px;
  overflow: hidden;
}

.quota-progress-fill {
  height: 100%;
  background: var(--ds-success);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.storage-warning {
  background: var(--ds-warning);
}

.storage-critical {
  background: var(--ds-danger);
}

.quota-percentage {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
  min-width: 30px;
  text-align: right;
}

.parse-option-cell {
  padding: var(--ds-space-sm);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  height: 50%;
  width: 100%;
  box-sizing: border-box;
}

.parse-option-cell .ds-input {
  width: 100%;
  max-height: 36px;
  min-height: 36px;
  padding: 6px 10px;
  font-size: var(--ds-text-sm);
  box-sizing: border-box;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  position: relative;
}

.input-label {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin-bottom: var(--ds-space-sm);
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
}

.input-hint {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  margin-top: 2px;
}

.ds-input {
  padding: var(--ds-space-md);
  background: var(--ds-surface-base);
  border: 2px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-base);
  font-family: var(--ds-font-sans);
  outline: none;
  transition: all var(--ds-transition-base);
  width: 100%;
  box-sizing: border-box;
}

.ds-input.with-icon {
  padding-right: 44px;
}

/* 带眼睛图标的密码框：右侧留空，图标在最右侧 */
.input-wrapper-inline:has(.password-toggle) .ds-input-inline,
.input-wrapper:has(.password-toggle) .ds-input-inline {
  padding-left: var(--ds-space-sm);
  padding-right: 40px;
}

.input-wrapper {
  position: relative;
  width: 100%;
}

.input-row {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-xs);
  margin-bottom: var(--ds-space-sm);
}

.input-label-inline {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  text-align: left;
  margin-bottom: var(--ds-space-xxs);
}

.input-wrapper-inline {
  position: relative;
  width: 100%;
}

.ds-input-inline {
  width: 100%;
  padding: var(--ds-space-sm);
  background: var(--ds-surface-base);
  border: 2px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-family: var(--ds-font-sans);
  outline: none;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

.ds-input-inline:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.2);
  background: var(--ds-surface-hover);
}

/* 密码眼睛图标：固定在输入框最右侧（覆盖后面的重复定义） */
.input-wrapper .password-toggle,
.input-wrapper-inline .password-toggle {
  left: auto;
  right: var(--ds-space-sm);
}

.password-toggle:focus {
  outline: 2px solid var(--ds-primary);
  outline-offset: 2px;
}

.ds-input:focus {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(78, 204, 163, 0.2);
  background: var(--ds-surface-hover);
}

/* 回合限制输入框：隐藏数字上下箭头，仅允许用户手动输入 */
.round-limit-input::-webkit-inner-spin-button,
.round-limit-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.round-limit-input[type="number"] {
  -moz-appearance: textfield;
  appearance: textfield;
}
</style>
