<template>
  <div class="keyboard-overlay">
    <!-- WASD 区域 -->
    <div class="wasd-section">
      <div class="wasd-grid">
        <!-- W 键 -->
        <div class="key-row top">
          <div
            class="key"
            :class="{ active: buttonStates.forward }"
          >
            W
          </div>
        </div>
        <!-- A S D 键 -->
        <div class="key-row middle">
          <div
            class="key"
            :class="{ active: buttonStates.left }"
          >
            A
          </div>
          <div
            class="key"
            :class="{ active: buttonStates.back }"
          >
            S
          </div>
          <div
            class="key"
            :class="{ active: buttonStates.right }"
          >
            D
          </div>
        </div>
      </div>
      <!-- 额外按键：跳跃和蹲下 -->
      <div class="extra-keys">
        <div
          class="key wide"
          :class="{ active: buttonStates.jump }"
          title="跳跃"
        >
          SPACE
        </div>
        <div
          class="key medium"
          :class="{ active: buttonStates.duck }"
          title="蹲下"
        >
          CTRL
        </div>
      </div>
    </div>

    <!-- 鼠标区域 -->
    <div class="mouse-section">
      <div class="mouse-container">
        <!-- 鼠标图形 -->
        <svg class="mouse-svg" width="48" height="72" viewBox="0 0 48 72">
          <!-- 鼠标外形 -->
          <path
            d="M8 24 C8 12 16 4 24 4 C32 4 40 12 40 24 L40 52 C40 62 32 68 24 68 C16 68 8 62 8 52 Z"
            fill="rgba(0,0,0,0.6)"
            stroke="rgba(255,255,255,0.4)"
            stroke-width="1.5"
          />
          <!-- 中间分隔线 -->
          <line x1="24" y1="4" x2="24" y2="36" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
          <!-- 左键区域 -->
          <path
            class="mouse-button left"
            :class="{ active: buttonStates.attack }"
            d="M8 24 C8 12 16 4 24 4 L24 36 L8 36 Z"
            :fill="buttonStates.attack ? 'rgba(74, 171, 247, 0.8)' : 'rgba(255,255,255,0.1)'"
          />
          <!-- 右键区域 -->
          <path
            class="mouse-button right"
            :class="{ active: buttonStates.attack2 }"
            d="M24 4 C32 4 40 12 40 24 L40 36 L24 36 Z"
            :fill="buttonStates.attack2 ? 'rgba(74, 171, 247, 0.8)' : 'rgba(255,255,255,0.1)'"
          />
          <!-- 滚轮 -->
          <rect x="21" y="16" width="6" height="12" rx="3" fill="rgba(255,255,255,0.3)"/>
        </svg>
        <!-- 鼠标按键标签 -->
        <div class="mouse-labels">
          <span :class="{ active: buttonStates.attack }">左键</span>
          <span :class="{ active: buttonStates.attack2 }">右键</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  buttonStates: {
    forward: boolean;
    back: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    attack2: boolean;
    jump: boolean;
    duck: boolean;
  };
}>();
</script>

<style scoped>
.keyboard-overlay {
  display: flex;
  gap: 20px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
}

/* WASD 区域 */
.wasd-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wasd-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.key-row {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.key-row.middle {
  justify-content: flex-start;
}

.key {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--ds-font-mono, monospace);
  transition: all 0.1s ease;
  user-select: none;
}

.key.small {
  width: 28px;
  height: 28px;
}

.key.wide {
  width: 72px;
  height: 28px;
  font-size: 10px;
}

.key.medium {
  width: 42px;
  height: 28px;
  font-size: 10px;
}

.key.active {
  background: rgba(74, 171, 247, 0.8);
  border-color: rgba(74, 171, 247, 1);
  color: #ffffff;
  box-shadow: 0 0 12px rgba(74, 171, 247, 0.5);
  transform: scale(0.95);
  animation: keyPulse 0.3s ease-out;
}

@keyframes keyPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(74, 171, 247, 0.8);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(74, 171, 247, 0);
  }
  100% {
    box-shadow: 0 0 12px rgba(74, 171, 247, 0.5);
  }
}

.extra-keys {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
}

/* 鼠标区域 */
.mouse-section {
  display: flex;
  align-items: center;
}

.mouse-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.mouse-svg {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.mouse-button {
  transition: fill 0.1s ease;
}

.mouse-labels {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.mouse-labels span {
  transition: color 0.1s ease;
}

.mouse-labels span.active {
  color: #4aabf7;
  font-weight: 600;
}
</style>
