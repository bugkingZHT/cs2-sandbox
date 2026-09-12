<template>
  <Teleport to="body">
    <div class="demo-import-overlay" @keydown="onKeydown" @dragover.prevent @drop.prevent>
      <section ref="dialog" class="demo-import-dialog" role="dialog" aria-modal="true" aria-labelledby="demo-import-title">
        <div class="demo-import-heading">
          <h2 id="demo-import-title">解析 DEMO</h2>
          <span class="demo-import-map-info">
            <button type="button" class="demo-import-info-button" aria-label="查看支持的地图" aria-describedby="demo-import-supported-maps">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".8" fill="currentColor" stroke="none"/></svg>
            </button>
            <span id="demo-import-supported-maps" class="demo-import-map-tooltip" role="tooltip"><strong>支持的地图</strong><span>{{ supportedMapsText }}</span></span>
          </span>
        </div>
        <p class="demo-import-subtitle">文件仅在本机处理，不会上传到云端。</p>
        <input ref="fileInput" class="demo-import-input" type="file" accept=".dem,.zip" multiple tabindex="-1" aria-label="选择 Demo 或 ZIP 文件" :disabled="submitting" @change="onFileChange" />
        <button
          ref="pickerButton" type="button" class="demo-import-dropzone" :class="{ 'is-dragover': dragDepth > 0 }"
          :disabled="submitting"
          @click="fileInput?.click()" @dragenter.prevent="dragDepth++" @dragleave.prevent="dragDepth = Math.max(0, dragDepth - 1)"
          @dragover.prevent @drop.prevent.stop="onDrop"
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5M12 3v12"/></svg>
          <strong>{{ submitting ? '正在导入文件…' : '拖拽文件到这里，或点击选择' }}</strong>
          <span>支持多选 .dem、.zip，也可以混合添加</span>
        </button>
        <p class="demo-import-hint">ZIP 中各级目录的 .dem 文件将自动提取，加入队列依次解析。</p>
        <div v-if="files.length" class="demo-import-selection">
          <div class="demo-import-selection-header"><span>已选择 {{ files.length }} 个文件 · {{ formatSize(totalSize) }}</span><button type="button" :disabled="submitting" @click="files = []">清空</button></div>
          <ul aria-label="待导入文件">
            <li v-for="(file, index) in files" :key="fileKey(file)">
              <span class="demo-import-filename" :title="file.name">{{ file.name }}</span>
              <span class="demo-import-size">{{ formatSize(file.size) }}</span>
              <button type="button" :disabled="submitting" :aria-label="'移除 ' + file.name" @click="files.splice(index, 1)">×</button>
            </li>
          </ul>
        </div>
        <div v-if="parsed.length || duplicates.length" class="demo-import-notice" role="status">
          <p v-if="parsed.length">以下文件曾经解析过或已在解析队列中，将忽略对这些文件的解析：</p>
          <ul v-if="parsed.length"><li v-for="name in parsed" :key="name">{{ name }}</li></ul>
          <p v-if="duplicates.length">以下文件名重复，将忽略重复项，仅解析一次：</p>
          <ul v-if="duplicates.length"><li v-for="name in duplicates" :key="name">{{ name }}</li></ul>
        </div>
        <p v-if="completed" class="demo-import-hint">本批导入已处理，重复文件已忽略。</p>
        <p v-if="error" class="demo-import-error" role="alert">{{ error }}</p>
        <p v-if="submitting" class="demo-import-hint" role="status">正在接收文件、检查 ZIP 内容并去重，请稍候…</p>
        <div class="demo-import-footer">
          <button type="button" class="ds-btn" :disabled="submitting" @click="close">关闭</button>
          <button v-if="completed" type="button" class="ds-btn ds-btn-primary" @click="emit('accepted')">完成</button>
          <button v-else type="button" class="ds-btn ds-btn-primary" :disabled="submitting || !files.length" @click="submit">{{ submitting ? '正在导入…' : '开始解析' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { SUPPORTED_PARSING_MAP_NAMES } from "@/config/map";
import { mergeImportFiles, fileKey, formatSize } from "@/local/importFiles";
import { useReplayData } from "@/composables/useReplayData";

const supportedMapsText = SUPPORTED_PARSING_MAP_NAMES.map(name => name.replace(/^de_/, "")).join("、");
const props = defineProps<{ start: (files: File[]) => Promise<{ skipped: string[]; duplicates: string[] }> }>();
const emit = defineEmits<{ (e: "close"): void; (e: "accepted"): void }>();
const files = ref<File[]>([]);
const error = ref("");
const submitting = ref(false);
const completed = ref(false);
const parsed = ref<string[]>([]), duplicates = ref<string[]>([]);
const { knownImportNames, refreshLibrary } = useReplayData();
const dragDepth = ref(0);
const dialog = ref<HTMLElement>();
const fileInput = ref<HTMLInputElement>();
const pickerButton = ref<HTMLButtonElement>();
const totalSize = computed(() => files.value.reduce((total, file) => total + file.size, 0));
const previousFocus = document.activeElement as HTMLElement | null;

function addFiles(incoming: File[]) {
  if (submitting.value) return;
  completed.value = false;
  const result = mergeImportFiles(files.value, incoming, knownImportNames.value);
  files.value = result.files;
  parsed.value = [...new Set([...parsed.value, ...result.parsed])];
  duplicates.value = [...new Set([...duplicates.value, ...result.duplicates])];
  error.value = result.rejected.length ? `已忽略不支持的文件：${result.rejected.join("、")}。请选择 .dem 或 .zip。` : "";
}
function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles(Array.from(input.files || []));
  input.value = "";
}
function onDrop(event: DragEvent) {
  dragDepth.value = 0;
  addFiles(Array.from(event.dataTransfer?.files || []));
}
function close() { if (!submitting.value) emit("close"); }
async function submit() {
  if (submitting.value || !files.value.length) return;
  submitting.value = true;
  error.value = "";
  try {
    const result = await props.start([...files.value]);
    files.value = [];
    if (result.skipped.length || result.duplicates.length) {
      parsed.value = [...new Set([...parsed.value, ...result.skipped])];
      duplicates.value = [...new Set([...duplicates.value, ...result.duplicates])];
      completed.value = true;
    } else emit("accepted");
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
  finally { submitting.value = false; }
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (event.key !== "Tab") return;
  const elements = dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled)");
  if (!elements?.length) return;
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
onMounted(() => {
  pickerButton.value?.focus();
  void refreshLibrary().catch(e => { error.value = String(e); });
});
onBeforeUnmount(() => previousFocus?.focus());
</script>

<style scoped>
.demo-import-overlay { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 20px; background: var(--ds-bg-overlay); }
.demo-import-dialog { box-sizing: border-box; width: min(560px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; background: var(--ds-bg-secondary); border: 1px solid var(--ds-border-default); border-radius: 12px; padding: 24px; color: var(--ds-text-primary); box-shadow: 0 24px 80px #0008; }
.demo-import-heading { position: relative; display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.demo-import-dialog h2 { margin: 0; font-size: 20px; }
.demo-import-map-info { display: inline-flex; }
.demo-import-info-button { display: grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 5px; background: none; color: var(--ds-text-tertiary); cursor: help; }
.demo-import-info-button:hover, .demo-import-info-button:focus-visible { color: var(--ds-text-primary); background: var(--ds-bg-tertiary); }
.demo-import-info-button:focus-visible { outline: 1px solid var(--ds-border-default); outline-offset: 2px; }
.demo-import-map-tooltip { position: absolute; top: 100%; left: 0; z-index: 1; box-sizing: border-box; width: min(320px, 100%); padding: 10px 12px; border: 1px solid var(--ds-border-default); border-radius: 7px; background: var(--ds-bg-tertiary); box-shadow: 0 6px 20px #0004; color: var(--ds-text-secondary); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; visibility: hidden; opacity: 0; }
.demo-import-map-tooltip strong { display: block; margin-bottom: 4px; color: var(--ds-text-primary); font-weight: 600; }
.demo-import-map-info:hover .demo-import-map-tooltip, .demo-import-map-info:focus-within .demo-import-map-tooltip { visibility: visible; opacity: 1; }
.demo-import-subtitle { margin: 0 0 22px; color: var(--ds-text-tertiary); font-size: 13px; }
.demo-import-input { display: none; }
.demo-import-dropzone { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 14px; border: 1px dashed var(--ds-border-default); border-radius: 8px; background: var(--ds-bg-primary); color: var(--ds-text-secondary); font: inherit; cursor: pointer; }
.demo-import-dropzone strong { font-size: 14px; color: var(--ds-text-primary); }
.demo-import-dropzone span { font-size: 12px; }
.demo-import-dropzone:hover, .demo-import-dropzone.is-dragover, .demo-import-dropzone:focus-visible { border-color: var(--ds-text-secondary); background: var(--ds-bg-tertiary); outline: none; }
.demo-import-dropzone:disabled { cursor: wait; opacity: .6; }
.demo-import-hint { margin: 12px 0 0; color: var(--ds-text-tertiary); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.demo-import-selection { margin-top: 16px; font-size: 12px; }
.demo-import-selection-header { display: flex; align-items: center; justify-content: space-between; color: var(--ds-text-secondary); }
.demo-import-selection button { background: none; border: none; padding: 4px 8px; color: var(--ds-text-secondary); cursor: pointer; }
.demo-import-selection button:disabled { opacity: .5; cursor: default; }
.demo-import-selection ul { list-style: none; padding: 0; margin: 8px 0 0; max-height: 180px; overflow-y: auto; border: 1px solid var(--ds-border-default); border-radius: 6px; }
.demo-import-selection li { display: flex; align-items: center; gap: 12px; padding: 8px 10px; }
.demo-import-selection li + li { border-top: 1px solid var(--ds-border-default); }
.demo-import-filename { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-import-size { color: var(--ds-text-tertiary); white-space: nowrap; }
.demo-import-error { margin: 14px 0 0; color: var(--ds-danger); font-size: 13px; overflow-wrap: anywhere; }
.demo-import-notice { margin-top: 14px; padding: 10px 14px; border: 1px solid var(--ds-border-default); border-radius: 6px; color: var(--ds-text-secondary); background: var(--ds-bg-tertiary); font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.demo-import-notice p { margin: 0; }
.demo-import-notice ul { margin: 6px 0; padding-left: 18px; max-height: 140px; overflow-y: auto; }
.demo-import-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
</style>
