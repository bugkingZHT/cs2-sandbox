<template>
  <button
    class="grenade-tracking-toggle"
    :class="{ active: isEnabled }"
    @click="$emit('toggle')"
    :title="isEnabled ? '关闭道具追踪 (点击投掷物可回溯操作)' : '开启道具追踪'"
  >
    <svg
      class="toggle-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <!-- 十字准星 -->
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
      <!-- 中心点 -->
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
    <span v-if="isEnabled" class="toggle-text">追踪中</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  isEnabled: boolean;
}>();

defineEmits<{
  (e: 'toggle'): void;
}>();
</script>

<style scoped>
.grenade-tracking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--ds-border-default, rgba(255, 255, 255, 0.2));
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  user-select: none;
}

.grenade-tracking-toggle:hover {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(255, 255, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
}

.grenade-tracking-toggle.active {
  background: rgba(74, 171, 247, 0.3);
  border-color: rgba(74, 171, 247, 0.8);
  color: #4aabf7;
}

.grenade-tracking-toggle.active:hover {
  background: rgba(74, 171, 247, 0.4);
}

.toggle-icon {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.grenade-tracking-toggle.active .toggle-icon {
  transform: scale(1.1);
}

.toggle-text {
  font-weight: 500;
  white-space: nowrap;
}
</style>
