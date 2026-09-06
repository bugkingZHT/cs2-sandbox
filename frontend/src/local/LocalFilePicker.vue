<template>
  <Teleport to="body">
    <div class="demo-import-overlay" @keydown="onKeydown">
      <section
        ref="dialog"
        class="demo-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-import-title"
      >
        <h2 id="demo-import-title">解析 DEMO</h2>
        <p class="demo-import-subtitle">直接读取本机文件，不会上传或修改原始 Demo。</p>
        <form @submit.prevent="submit">
          <label for="demo-import-path">Demo 文件完整路径</label>
          <input
            id="demo-import-path"
            ref="pathInput"
            v-model="path"
            :disabled="submitting"
            placeholder="粘贴 .dem 文件完整路径"
            autocomplete="off"
          />
        </form>
        <p v-if="error" class="demo-import-error" role="alert">{{ error }}</p>
        <div class="demo-import-footer">
          <button type="button" class="ds-btn" :disabled="submitting" @click="close">取消</button>
          <button type="button" class="ds-btn ds-btn-primary" :disabled="submitting || !path.trim()" @click="submit">
            {{ submitting ? "正在打开…" : "开始解析" }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ start: (path: string) => Promise<void> }>();
const emit = defineEmits<{ (e: "close"): void; (e: "accepted"): void }>();
const path = ref("");
const error = ref("");
const submitting = ref(false);
const dialog = ref<HTMLElement>();
const pathInput = ref<HTMLInputElement>();
const previousFocus = document.activeElement as HTMLElement | null;

function close() {
  if (!submitting.value) emit("close");
}

async function submit() {
  if (submitting.value) return;
  path.value = path.value.trim().replace(/^"(.*)"$/, "$1");
  if (!/\.dem$/i.test(path.value)) {
    error.value = "请选择 .dem 文件";
    return;
  }
  submitting.value = true;
  error.value = "";
  try {
    await props.start(path.value);
    emit("accepted");
  } catch (e) {
    error.value = String(e);
  } finally {
    submitting.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const elements = dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)");
  if (!elements?.length) return;
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => pathInput.value?.focus());
onBeforeUnmount(() => previousFocus?.focus());
</script>

<style scoped>
.demo-import-overlay { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 20px; background: var(--ds-bg-overlay); }
.demo-import-dialog { width: min(560px, 100%); background: var(--ds-bg-secondary); border: 1px solid var(--ds-border-default); border-radius: 12px; padding: 24px; color: var(--ds-text-primary); box-shadow: 0 24px 80px #0008; }
.demo-import-dialog h2 { margin: 0 0 6px; font-size: 20px; }
.demo-import-subtitle { margin: 0 0 22px; color: var(--ds-text-tertiary); font-size: 13px; }
.demo-import-dialog form { display: grid; gap: 10px; font-size: 13px; }
.demo-import-dialog input { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid var(--ds-border-default); border-radius: 6px; background: var(--ds-bg-primary); color: var(--ds-text-primary); font: inherit; }
.demo-import-dialog input:focus { outline: 1px solid var(--ds-text-secondary); }
.demo-import-error { margin: 14px 0 0; color: var(--ds-danger); font-size: 13px; overflow-wrap: anywhere; }
.demo-import-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
</style>
