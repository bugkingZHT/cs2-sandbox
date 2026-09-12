<template>
  <div class="demo-alias" @click.stop @keydown.stop>
    <div v-if="editing" class="demo-alias-editor" @focusout="onFocusOut" @keydown.esc.prevent="cancel">
      <span class="demo-alias-input-wrap">
        <span class="demo-alias-input-measure" aria-hidden="true">{{ draft || ' ' }} </span>
        <input ref="input" v-model="draft" class="demo-alias-input" aria-label="Demo 名称" maxlength="120" :readonly="saving" :aria-busy="saving" @keydown.enter="onEnter" />
      </span>
      <button type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <button type="button" :disabled="saving" @click="cancel">取消</button>
    </div>
    <button v-else class="demo-alias-label" type="button" :title="name + ' · 点击编辑名称'" :aria-label="'编辑名称：' + name" @click="edit">
      <span>{{ name }}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m16 3 5 5-13 13H3v-5L16 3ZM13 6l5 5"/></svg>
    </button>
    <p v-if="error" class="demo-alias-error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useReplayData } from '@/composables/useReplayData';

const props = defineProps<{ id: string; name: string }>();
const { renameDemo } = useReplayData();
const editing = ref(false), saving = ref(false), draft = ref(''), error = ref('');
const input = ref<HTMLInputElement>();
async function edit() {
  draft.value = props.name;
  error.value = '';
  editing.value = true;
  await nextTick();
  input.value?.focus();
  input.value?.select();
}
function cancel() { if (!saving.value) { editing.value = false; error.value = ''; } }
function onFocusOut(event: FocusEvent) {
  // Moving focus to Save/Cancel stays within the editor; their clicks decide.
  if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return;
  void save();
}
function onEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  void save();
}
async function save() {
  if (!editing.value || saving.value) return;
  const name = draft.value.trim();
  if (!name || name === props.name) { cancel(); return; }
  saving.value = true;
  error.value = '';
  try {
    await renameDemo(props.id, name);
    editing.value = false;
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.demo-alias { min-width: 0; }
.demo-alias-label { display: flex; align-items: center; gap: 8px; max-width: 100%; border: 0; padding: 5px 0; background: none; color: var(--ds-text-primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; text-align: left; }
.demo-alias-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-alias-label svg { flex-shrink: 0; color: var(--ds-text-tertiary); }
.demo-alias-label:hover svg { color: var(--ds-text-primary); }
.demo-alias-editor { display: flex; align-items: center; gap: 6px; width: max-content; max-width: 100%; }
.demo-alias-editor button { flex-shrink: 0; padding: 5px; border: 0; border-radius: 4px; background: var(--ds-bg-tertiary); color: var(--ds-text-primary); font: inherit; font-size: 12px; cursor: pointer; }
.demo-alias-editor button:disabled { opacity: .5; cursor: default; }
.demo-alias-input-wrap { position: relative; min-width: 0; max-width: 420px; flex: 0 1 auto; font: inherit; font-size: 13px; }
.demo-alias-input-measure { display: block; box-sizing: border-box; min-width: 180px; padding: 5px 8px; border: 1px solid transparent; white-space: pre; visibility: hidden; }
.demo-alias-input { position: absolute; inset: 0; box-sizing: border-box; min-width: 0; width: 100%; padding: 5px 8px; border: 1px solid var(--ds-border-default); border-radius: 5px; background: var(--ds-bg-primary); color: var(--ds-text-primary); font: inherit; }
.demo-alias-input:read-only { opacity: .6; }
.demo-alias-error { margin: 4px 0 0; color: var(--ds-danger); font-size: 12px; overflow-wrap: anywhere; }
</style>
