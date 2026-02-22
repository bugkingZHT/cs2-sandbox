<template>
    <div class="doc-editor" :class="{ 'is-read-only': readOnly }">
      <!-- 工具栏 -->
      <div v-if="!readOnly" class="toolbar" @mousedown.prevent>
        <!-- 格式 -->
        <div class="toolbar-group">
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: formatState.bold }"
            title="加粗"
            @click="execFormat('bold')"
          >
            <span class="btn-text">B</span>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: formatState.italic }"
            title="斜体"
            @click="execFormat('italic')"
          >
            <span class="btn-text italic-preview">I</span>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: formatState.underline }"
            title="下划线"
            @click="execFormat('underline')"
          >
            <span class="btn-text underline-preview">U</span>
          </button>
          <button
            type="button"
            class="toolbar-btn"
            :class="{ active: formatState.strikeThrough }"
            title="删除线"
            @click="execFormat('strikeThrough')"
          >
            <span class="btn-text strike-preview">S</span>
          </button>
        </div>
  
        <div class="toolbar-divider" />
  
        <!-- 文字颜色 -->
        <div class="toolbar-group">
          <button
            v-for="c in textColors"
            :key="c.id"
            type="button"
            class="toolbar-btn color-btn"
            :class="{ active: formatState.color === c.id }"
            :title="c.label"
            :style="{ color: c.hex }"
            @click="applyColor(c.id)"
          >
            A
          </button>
        </div>
  
        <div class="toolbar-divider" />
  
        <!-- 装备图标 -->
        <div class="toolbar-group">
          <button
            v-for="icon in equipmentIcons"
            :key="icon.id"
            type="button"
            class="toolbar-btn icon-btn"
            :title="icon.label"
            @click="insertIcon(icon)"
          >
            <img :src="icon.src" :alt="icon.label" class="toolbar-icon" />
          </button>
        </div>
      </div>
  
      <!-- 编辑区 -->
      <div
        ref="editorRef"
        class="editor-body"
        :contenteditable="!readOnly"
        data-placeholder="在此输入内容…"
        @input="onInput"
        @keydown="onKeydown"
        @keyup="updateFormatState"
        @mouseup="updateFormatState"
      />
    </div>
  </template>
  
  <script setup lang="ts">
  import { ref, watch, onMounted, nextTick } from 'vue';
  
  const TEXT_COLORS = [
    { id: 'white', label: '白', hex: '#FFFFFF' },
    { id: 'yellow', label: '黄', hex: '#F5C518' },
    { id: 'green', label: '绿', hex: '#00C853' },
    { id: 'blue', label: '蓝', hex: '#2196F3' },
    { id: 'purple', label: '紫', hex: '#9C27B0' },
    { id: 'orange', label: '橙', hex: '#FF6D00' },
  ] as const;
  
  const EQUIPMENT_ICONS = [
    { id: 'smoke', label: '烟', src: '/utility/smoke.svg' },
    { id: 'flash', label: '闪', src: '/utility/flash.svg' },
    { id: 'hegrenade', label: '雷', src: '/utility/hegrenade.svg' },
    { id: 'molotov', label: '火', src: '/utility/molotov.svg' },
    { id: 'decoy', label: '诱饵', src: '/utility/decoy.svg' },
    { id: 'c4', label: 'C4', src: '/utility/c4.svg' },
  ] as const;
  
  const props = withDefaults(
    defineProps<{
      modelValue: string;
      readOnly?: boolean;
    }>(),
    { readOnly: false }
  );
  
  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'change', value: string): void;
  }>();
  
  const editorRef = ref<HTMLDivElement | null>(null);
  const textColors = TEXT_COLORS;
  const equipmentIcons = EQUIPMENT_ICONS;
  
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const shortcutList = [
    { key: 'Ctrl/Cmd + B', desc: '加粗' },
    { key: 'Ctrl/Cmd + I', desc: '斜体' },
    { key: 'Ctrl/Cmd + U', desc: '下划线' },
    { key: 'Ctrl/Cmd + Shift + X', desc: '删除线' },
  ];
  
  const formatState = ref({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    color: null as string | null,
  });
  
  function getEditorEl(): HTMLDivElement | null {
    return editorRef.value;
  }
  
  function getSelectionWithinEditor(): Selection | null {
    const sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const el = getEditorEl();
    if (!el || !el.contains(sel.anchorNode)) return null;
    return sel;
  }
  
  /** 判断是否为格式包裹元素（加粗/斜体/颜色等） */
  function isFormatElement(node: Node): node is Element {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const el = node as Element;
    if (['STRONG', 'B', 'EM', 'I', 'U', 'S'].includes(el.tagName)) return true;
    if (el.tagName === 'SPAN' && el.classList.contains('text-color')) return true;
    return false;
  }
  
  /** 将光标移到当前所在格式元素之后，使后续输入不再继承该样式 */
  function collapseSelectionAfterFormatting() {
    const sel = getSelectionWithinEditor();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editor = getEditorEl();
    if (!editor) return;
    let node: Node | null = range.startContainer;
    while (node && node !== editor) {
      if (isFormatElement(node)) {
        range.setStartAfter(node);
        range.setEndAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      node = node.parentNode;
    }
  }
  
  function execFormat(cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough') {
    const el = getEditorEl();
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false);
    collapseSelectionAfterFormatting();
    syncFromDom();
    updateFormatState();
  }
  
  function applyColor(colorId: string) {
    const sel = getSelectionWithinEditor();
    const el = getEditorEl();
    if (!el) return;
    el.focus();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.className = `text-color text-color-${colorId}`;
      if (!range.collapsed) {
        try {
          const contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
          range.setStartAfter(span);
          range.setEndAfter(span);
        } catch {
          range.surroundContents(span);
          range.setStartAfter(span);
          range.setEndAfter(span);
          range.collapse(true);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        syncFromDom();
      } else {
        span.innerHTML = '\u200B';
        range.insertNode(span);
        range.setStart(span, 1);
        range.setEnd(span, 1);
        sel.removeAllRanges();
        sel.addRange(range);
        syncFromDom();
      }
    }
    updateFormatState();
  }
  
  function insertIcon(icon: (typeof EQUIPMENT_ICONS)[number]) {
    const el = getEditorEl();
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const img = document.createElement('img');
      img.src = icon.src;
      img.alt = icon.label;
      img.className = 'equipment-inline-icon';
      img.setAttribute('data-equipment', icon.id);
      range.insertNode(img);
      range.setStartAfter(img);
      range.setEndAfter(img);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.innerHTML += `<img src="${icon.src}" alt="${icon.label}" class="equipment-inline-icon" data-equipment="${icon.id}">`;
    }
    syncFromDom();
  }
  
  function syncFromDom() {
    const el = getEditorEl();
    if (!el) return;
    const html = el.innerHTML;
    if (html !== props.modelValue) {
      emit('update:modelValue', html);
      emit('change', html);
    }
  }
  
  function onInput() {
    syncFromDom();
  }
  
  function onKeydown(e: KeyboardEvent) {
    const isMod = isMac ? e.metaKey : e.ctrlKey;
    if (isMod && e.shiftKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      execFormat('strikeThrough');
    }
  }
  
  function updateFormatState() {
    const sel = getSelectionWithinEditor();
    if (!sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    formatState.value = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      color: getColorAtCursor(range),
    };
  }
  
  function getColorAtCursor(range: Range): string | null {
    let node: Node | null = range.startContainer;
    const el = getEditorEl();
    if (!el) return null;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const elNode = node as Element;
        const cls = elNode.getAttribute?.('class') || '';
        const m = cls.match(/text-color-(white|yellow|green|blue|purple|orange)/);
        if (m) return m[1];
      }
      node = node.parentNode;
    }
    return null;
  }
  
  watch(
    () => props.modelValue,
    (val) => {
      const el = getEditorEl();
      if (!el || el.innerHTML === val) return;
      el.innerHTML = val || '';
    },
    { immediate: false }
  );
  
  onMounted(() => {
    nextTick(() => {
      const el = getEditorEl();
      if (el) {
        const val = props.modelValue;
        if (val !== el.innerHTML) el.innerHTML = val || '';
      }
    });
  });
  </script>
  
  <style scoped>
  .doc-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--ds-bg-primary);
  }
  
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 2px;
    padding: var(--ds-space-sm);
    background: var(--ds-bg-secondary);
    border-bottom: 1px solid var(--ds-border-subtle);
    flex-shrink: 0;
  }
  
  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  
  .toolbar-divider {
    width: 1px;
    height: 20px;
    margin: 0 6px;
    background: var(--ds-border-default);
  }
  
  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: var(--ds-radius-sm);
    background: transparent;
    color: var(--ds-text-secondary);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: background var(--ds-transition-base), color var(--ds-transition-base);
  }
  
  .toolbar-btn:hover {
    background: var(--ds-surface-hover);
    color: var(--ds-text-primary);
  }
  
  .toolbar-btn.active {
    background: var(--ds-surface-active);
    color: var(--ds-text-primary);
    border-color: transparent;
  }
  
  .toolbar-btn .italic-preview { font-style: italic; }
  .toolbar-btn .underline-preview { text-decoration: underline; }
  .toolbar-btn .strike-preview { text-decoration: line-through; }
  
  .color-btn {
    font-weight: 700;
  }
  
  .toolbar-btn.icon-btn {
    padding: 4px;
  }
  
  .toolbar-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    pointer-events: none;
  }
  
  .shortcut-hint-btn {
    margin-left: auto;
  }
  
  .shortcut-icon {
    width: 18px;
    height: 18px;
    display: block;
  }
  
  /* 快捷键说明 Modal */
  .shortcut-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  
  .shortcut-modal {
    background: var(--ds-bg-primary);
    border-radius: var(--ds-radius-md);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    min-width: 320px;
    max-width: 90vw;
  }
  
  .shortcut-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--ds-space-md) var(--ds-space-lg);
    border-bottom: 1px solid var(--ds-border-subtle);
  }
  
  .shortcut-modal-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--ds-text-primary);
  }
  
  .shortcut-modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--ds-radius-sm);
    background: transparent;
    color: var(--ds-text-secondary);
    cursor: pointer;
    transition: background var(--ds-transition-base), color var(--ds-transition-base);
  }
  
  .shortcut-modal-close:hover {
    background: var(--ds-surface-hover);
    color: var(--ds-text-primary);
  }
  
  .shortcut-modal-body {
    padding: var(--ds-space-lg);
  }
  
  .shortcut-list {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 24px;
    margin: 0;
    align-items: baseline;
  }
  
  .shortcut-keys {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 13px;
    color: var(--ds-text-secondary);
    background: var(--ds-bg-secondary);
    padding: 4px 8px;
    border-radius: var(--ds-radius-xs);
  }
  
  .shortcut-desc {
    margin: 0;
    font-size: 14px;
    color: var(--ds-text-primary);
  }
  
  .editor-body {
    flex: 1;
    min-height: 360px;
    padding: var(--ds-space-md);
    overflow-y: auto;
    outline: none;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ds-text-primary);
    border-radius: 8px;
  }
  
  .editor-body:empty::before {
    content: attr(data-placeholder);
    color: var(--ds-text-tertiary);
  }
  
  /* 编辑区内样式与预览一致：加粗 + 字号 +2px */
  .editor-body :deep(strong),
  .editor-body :deep(b) {
    font-weight: 600;
    font-size: calc(1em + 2px);
  }
  
  .editor-body :deep(em),
  .editor-body :deep(i) {
    font-style: italic;
  }
  
  .editor-body :deep(u) {
    text-decoration: underline;
  }
  
  .editor-body :deep(s) {
    text-decoration: line-through;
  }
  
  .editor-body :deep(.text-color-white) { color: #FFFFFF; }
  .editor-body :deep(.text-color-yellow) { color: #F5C518; }
  .editor-body :deep(.text-color-green) { color: #00C853; }
  .editor-body :deep(.text-color-blue) { color: #2196F3; }
  .editor-body :deep(.text-color-purple) { color: #9C27B0; }
  .editor-body :deep(.text-color-orange) { color: #FF6D00; }
  
  .editor-body :deep(.equipment-inline-icon) {
    width: 18px;
    height: 18px;
    vertical-align: middle;
    margin: 0 2px;
    object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  }
  </style>