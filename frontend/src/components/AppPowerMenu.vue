<template>
  <button ref="trigger" class="power-trigger" type="button" popovertarget="app-power-menu" aria-label="系统选项" aria-haspopup="menu" :aria-expanded="menuOpen" @keydown.up.prevent="openMenu">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/></svg>
    <span v-if="!collapsed">系统选项</span>
  </button>
  <div id="app-power-menu" ref="menu" popover="auto" class="power-menu" role="menu" aria-label="系统选项" @toggle="onToggle" @keydown="onMenuKeydown">
    <button role="menuitem" @click="openSettings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 3-.7 2.2-2 .9-2.1-.5-2 3.4 1.5 1.7v2.6L2.2 15l2 3.4 2.1-.5 2 .9L9 21h4l.7-2.2 2-.9 2.1.5 2-3.4-1.5-1.7v-2.6L19.8 9l-2-3.4-2.1.5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>
      设置
    </button>
    <div class="menu-separator" role="separator"></div>
    <button class="quit-item" role="menuitem" @click="closeMenu(); $emit('quit')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 17v3H4V4h6v3m4 1 4 4-4 4m-6-4h14"/></svg>
      退出本地工具
    </button>
  </div>
  <dialog ref="settings" class="settings-dialog" aria-labelledby="settings-title" @click="onDialogClick" @close="trigger?.focus()">
    <header class="settings-header">
      <h2 id="settings-title">设置</h2>
      <button class="close-button" aria-label="关闭设置" autofocus @click="settings?.close()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
    </header>
    <div id="replay-settings-content"></div>
    <p v-if="!playerPage" class="settings-empty">打开对局后，可在这里调整地图显示。</p>
  </dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
defineProps<{ collapsed: boolean; playerPage: boolean }>();
defineEmits<{ quit: [] }>();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const settings = ref<HTMLDialogElement>();
const menuOpen = ref(false);
function closeMenu() { menu.value?.hidePopover(); }
function openMenu() { menu.value?.showPopover(); }
function onToggle(event: Event) {
  menuOpen.value = (event as Event & { newState: string }).newState === 'open';
  if (menuOpen.value) menu.value?.querySelector<HTMLButtonElement>('button')?.focus();
}
function openSettings() {
  closeMenu();
  settings.value?.showModal();
}
function onDialogClick(event: MouseEvent) {
  if (event.target !== settings.value) return;
  const rect = settings.value.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settings.value.close();
}
function onMenuKeydown(event: KeyboardEvent) {
  const buttons = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
  } else if (event.key === 'Tab') {
    closeMenu();
    trigger.value?.focus();
  }
}
</script>

<style scoped>
.power-trigger { display: flex; align-items: center; gap: 10px; width: 100%; height: 36px; padding: 0 10px; background: transparent; border: 0; border-radius: var(--ds-radius-sm); color: var(--ds-text-tertiary); font-size: 13px; cursor: pointer; }
.power-trigger:hover, .power-trigger[aria-expanded="true"] { background: var(--ds-surface-hover); color: var(--ds-text-primary); }
svg { width: 18px; height: 18px; flex-shrink: 0; }
.power-menu { position: fixed; inset: auto auto 64px 12px; margin: 0; width: 200px; padding: 5px; background: var(--ds-bg-secondary); border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-md); color: var(--ds-text-primary); box-shadow: var(--ds-shadow-lg); }
.power-menu button { display: flex; align-items: center; gap: 10px; width: 100%; height: var(--sidebar-row-height); padding: 0 10px; background: transparent; border: 0; border-radius: var(--ds-radius-sm); color: var(--ds-text-secondary); font-size: 13px; cursor: pointer; text-align: left; }
.power-menu button:hover, .power-menu button:focus-visible { background: var(--ds-surface-hover); }
.power-menu .quit-item { color: var(--ds-danger); }
.menu-separator { height: 1px; margin: 4px; background: var(--ds-border-default); }
.settings-dialog { width: min(400px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); margin: auto; padding: var(--ds-space-xl); overflow-y: auto; background: var(--ds-bg-secondary); color: var(--ds-text-primary); border: 1px solid var(--ds-border-default); border-radius: var(--ds-radius-lg); box-shadow: var(--ds-shadow-lg); }
.settings-dialog::backdrop { background: rgb(0 0 0 / .6); }
.settings-header { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-md); margin-bottom: var(--ds-space-lg); }
.settings-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
.close-button { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: var(--ds-radius-sm); background: transparent; color: var(--ds-text-tertiary); cursor: pointer; }
.close-button:hover { background: var(--ds-surface-hover); color: var(--ds-text-primary); }
.settings-empty { font-size: 13px; color: var(--ds-text-tertiary); line-height: 1.6; }
button:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: -2px; }
</style>
