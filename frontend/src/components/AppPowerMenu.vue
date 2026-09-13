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
    <button role="menuitem" @click="openVersionInfo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg>
      版本信息
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
    <fieldset class="map-settings">
      <legend>地图显示</legend>
      <label><span>玩家</span><input type="checkbox" v-model="showMapPlayers" /></label>
      <label><span>投掷物</span><input type="checkbox" v-model="showMapProjectiles" /></label>
      <label><span>掉落道具</span><input type="checkbox" v-model="showMapDropped" /></label>
      <label><span>C4</span><input type="checkbox" v-model="showMapBomb" /></label>
      <div class="size-control">
        <label for="map-player-size"><span>玩家圆大小</span><output for="map-player-size">{{ playerSize }}%</output></label>
        <input id="map-player-size" type="range" v-model.number="playerSize" v-bind="playerSizeRange" aria-describedby="map-player-size-hint" />
        <p id="map-player-size-hint">随地图等比例缩放</p>
      </div>
      <div class="size-control">
        <label for="map-player-name-size"><span>玩家名称大小</span><output for="map-player-name-size">{{ playerNameSize }}%</output></label>
        <input id="map-player-name-size" type="range" v-model.number="playerNameSize" v-bind="playerNameSizeRange" aria-describedby="map-player-name-size-hint" />
        <p id="map-player-name-size-hint">缩放地图时，文字大小保持不变</p>
      </div>
      <button class="reset-player-appearance" type="button" @click="resetPlayerAppearance">恢复默认大小</button>
    </fieldset>
  </dialog>
  <dialog ref="versionInfo" class="settings-dialog" aria-labelledby="version-info-title" @click="onDialogClick" @close="trigger?.focus()">
    <header class="settings-header">
      <h2 id="version-info-title">版本信息</h2>
      <button class="close-button" aria-label="Close version information" autofocus @click="versionInfo?.close()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M6 18 18 6"/></svg>
      </button>
    </header>
    <p class="app-version">{{ appVersion }}</p>
    <dl class="version-details">
      <div>
        <dt>Build UID <span>SHA-256</span></dt>
        <dd class="uid-actions">
          <code v-if="buildUID">{{ buildUID.slice(0, 16) }}</code>
          <button class="copy-uid" type="button" :disabled="!buildUID || copyingUID" @click="copyBuildUID">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>
            copy
          </button>
          <span role="status">{{ buildInfoError || (!buildUID ? 'Loading…' : copyUIDMessage) }}</span>
        </dd>
      </div>
    </dl>
  </dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useMapDisplaySettings } from '@/composables/useMapDisplaySettings';
import { PLAYER_DISPLAY_CONTROLS } from '@/config/map';
import { localAPI } from '@/local/api';
const { showMapPlayers, showMapProjectiles, showMapDropped, showMapBomb, playerSize, playerNameSize } = useMapDisplaySettings();
const { default: defaultPlayerSize, ...playerSizeRange } = PLAYER_DISPLAY_CONTROLS.playerSize;
const { default: defaultPlayerNameSize, ...playerNameSizeRange } = PLAYER_DISPLAY_CONTROLS.playerNameSize;
function resetPlayerAppearance() {
  playerSize.value = defaultPlayerSize;
  playerNameSize.value = defaultPlayerNameSize;
}
const appVersion = __APP_VERSION__;
defineProps<{ collapsed: boolean }>();
defineEmits<{ quit: [] }>();
const trigger = ref<HTMLButtonElement>();
const menu = ref<HTMLElement>();
const settings = ref<HTMLDialogElement>();
const versionInfo = ref<HTMLDialogElement>();
const buildUID = ref('');
const buildInfoError = ref('');
const copyingUID = ref(false);
const copyUIDMessage = ref('');
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
async function openVersionInfo() {
  closeMenu();
  copyUIDMessage.value = '';
  versionInfo.value?.showModal();
  if (buildUID.value) return;
  buildInfoError.value = '';
  try {
    const info = await localAPI<{ uid: string }>('build-info');
    if (!/^[a-f0-9]{64}$/.test(info?.uid ?? '')) throw new Error('missing UID');
    buildUID.value = info.uid;
  } catch {
    buildInfoError.value = 'Unable to load UID. Reopen to retry.';
  }
}
async function copyBuildUID() {
  if (!buildUID.value || copyingUID.value) return;
  copyingUID.value = true;
  copyUIDMessage.value = '';
  try {
    await navigator.clipboard.writeText(buildUID.value);
    copyUIDMessage.value = 'Copied';
  } catch {
    copyUIDMessage.value = 'Copy failed. Please retry.';
  } finally {
    copyingUID.value = false;
  }
}
function onDialogClick(event: MouseEvent) {
  const dialog = event.currentTarget as HTMLDialogElement;
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
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
.map-settings { border: 0; padding: 0; margin: 0; min-width: 0; }
.map-settings legend { padding: 0 0 var(--ds-space-sm); font-size: 12px; color: var(--ds-text-tertiary); }
.map-settings label { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-lg); padding: var(--ds-space-md) 0; font-size: 13px; color: var(--ds-text-secondary); cursor: pointer; }
.map-settings input { margin: 0; accent-color: var(--ds-primary); }
.map-settings input[type="checkbox"] { width: 16px; height: 16px; }
.map-settings input:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 3px; }
.map-settings > label + .size-control { margin-top: var(--ds-space-sm); }
.size-control + .size-control { margin-top: var(--ds-space-md); }
.size-control label { padding: var(--ds-space-sm) 0; }
.size-control output { color: var(--ds-text-primary); font-variant-numeric: tabular-nums; }
.size-control input[type="range"] { display: block; width: 100%; height: 22px; cursor: pointer; }
.size-control p { margin: 4px 0 0; font-size: 12px; color: var(--ds-text-tertiary); }
.reset-player-appearance { margin-top: var(--ds-space-md); padding: 4px 0; border: 0; background: transparent; color: var(--ds-text-secondary); font-size: 12px; cursor: pointer; }
.reset-player-appearance:hover { color: var(--ds-text-primary); }
.version-details { margin: 0; font-size: 13px; }
.app-version { margin: 0 0 var(--ds-space-lg); padding-bottom: var(--ds-space-lg); border-bottom: 1px solid var(--ds-border-default); font-size: 13px; }
.version-details dt { color: var(--ds-text-tertiary); }
.version-details dt span { margin-left: 6px; font-size: 11px; }
.version-details dd { margin: var(--ds-space-sm) 0 0; overflow-wrap: anywhere; line-height: 1.6; }
.uid-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ds-space-sm); }
.uid-actions code { font-size: 12px; user-select: text; }
.uid-actions [role="status"] { color: var(--ds-text-tertiary); font-size: 12px; }
.copy-uid { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px; border: 0; border-radius: var(--ds-radius-sm); background: transparent; color: var(--ds-text-secondary); font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; }
.copy-uid svg { width: 13px; height: 13px; }
.copy-uid:hover:enabled { background: var(--ds-surface-hover); color: var(--ds-text-primary); }
.copy-uid:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: -2px; }
</style>
