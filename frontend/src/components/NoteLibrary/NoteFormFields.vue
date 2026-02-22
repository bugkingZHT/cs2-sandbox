<template>
  <div class="note-form-fields">
    <div class="form-group">
      <input
        :value="title"
        type="text"
        class="form-input"
        maxlength="64"
        placeholder="笔记名称"
        :readonly="disabled"
        :disabled="disabled"
        @input="$emit('update:title', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="form-group note-form-editor-wrap">
      <Editor :model-value="content" :read-only="disabled" @update:model-value="$emit('update:content', $event)" />
    </div>
    <div v-if="isNoteOwner" class="form-group">
      <div class="form-radios">
        <label class="form-radio">
          <input
            :checked="permission === 'private'"
            type="radio"
            value="private"
            :disabled="disabled"
            @change="$emit('update:permission', 'private')"
          />
          <span>仅自己可见</span>
        </label>
        <label class="form-radio">
          <input
            :checked="permission === 'public'"
            type="radio"
            value="public"
            :disabled="disabled"
            @change="$emit('update:permission', 'public')"
          />
          <span>公开链接</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Editor from './Editor.vue';

withDefaults(
  defineProps<{
    title: string;
    content: string;
    permission: 'private' | 'public';
    disabled?: boolean;
    isNoteOwner?: boolean;
  }>(),
  { disabled: false, isNoteOwner: true }
);

defineEmits<{
  (e: 'update:title', v: string): void;
  (e: 'update:content', v: string): void;
  (e: 'update:permission', v: 'private' | 'public'): void;
}>();
</script>

<style scoped>
.note-form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-input {
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-md);
  font-size: var(--ds-text-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  background: var(--ds-bg-primary);
  color: var(--ds-text-primary);
  box-sizing: border-box;
}

.form-input::placeholder {
  color: var(--ds-text-tertiary);
}

.form-radios {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.form-radio {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  cursor: pointer;
}

.form-radio input {
  margin: 0;
}

.note-form-editor-wrap {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.note-form-editor-wrap :deep(.doc-editor) {
  flex: 1;
  min-height: 0;
}
</style>
