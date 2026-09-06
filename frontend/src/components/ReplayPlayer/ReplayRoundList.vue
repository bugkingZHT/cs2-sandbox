<template>
  <section class="replay-rounds" aria-label="回合选择">
    <div class="rounds-heading">
      <h2>回合 <span>{{ totalRounds }}</span></h2>
    </div>
    <div ref="roundList" class="rounds-scroll ds-scrollbar">
      <p v-if="!totalRounds" class="rounds-empty">打开一场对局后查看回合</p>
      <template v-for="row in rows" :key="row.round">
        <button
          class="round-row"
          :data-round="row.round"
          :class="{ selected: isSelected(row.round), 'is-multiselect': clipMode }"
          :aria-pressed="isSelected(row.round)"
          :aria-label="`第 ${row.round} 回合${clipMode ? (isSelected(row.round) ? '，已选中' : '，未选中') : ''}`"
          :title="`第 ${row.round} 回合${clipMode ? (isSelected(row.round) ? '，点击取消选择' : '，点击加入并行播放') : ''}`"
          :disabled="loading || (availableRounds && !availableRounds.includes(row.round)) || (restricted && row.round !== currentRound)"
          @click="$emit('select', row.round)"
        >
          <span v-if="clipMode" class="selection-mark" aria-hidden="true">
            <svg v-if="isSelected(row.round)" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 8 3 3 7-7" /></svg>
          </span>
          <span class="economy-tag" :class="row.economy.left">{{ row.economy.left }}</span>
          <span class="round-center">
            <img v-if="row.icon && row.iconFirst" :src="row.icon" :alt="row.result || ''" />
            <span>{{ row.round }}</span>
            <img v-if="row.icon && !row.iconFirst" :src="row.icon" :alt="row.result || ''" />
          </span>
          <span class="economy-tag" :class="row.economy.right">{{ row.economy.right }}</span>
        </button>
        <div v-if="row.round === 12 && totalRounds > 12" class="half-divider" role="separator" aria-label="下半场"></div>
      </template>
    </div>
    <div v-if="clipMode" class="clip-actions">
      <div class="selection-summary">
        <span aria-live="polite">已选 {{ selectedRounds.length }} 个回合</span>
        <button class="text-button" :disabled="!selectedRounds.length" @click="$emit('clear')">清空</button>
      </div>
      <p v-if="mergeError" class="merge-error" role="alert">{{ mergeError }}</p>
      <p v-if="merging" class="rounds-hint" role="status">正在合并回合…</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { RoundResultInfo } from '@/types/replay';
import { getRoundEconomyTypes, getRoundResult, getRoundResultIcon, shouldIconBeFirst } from '@/config/eco';

const props = defineProps<{
  totalRounds: number;
  roundResults?: RoundResultInfo[];
  currentRound: number;
  clipMode: boolean;
  selectedRounds: number[];
  availableRounds?: number[];
  restricted: boolean;
  loading: boolean;
  merging: boolean;
  mergeError: string | null;
}>();
defineEmits<{ select: [round: number]; clear: [] }>();
const rows = computed(() => Array.from({ length: props.totalRounds }, (_, i) => {
  const round = i + 1;
  return {
    round,
    economy: getRoundEconomyTypes(round, props.roundResults),
    icon: getRoundResultIcon(round, props.roundResults),
    iconFirst: shouldIconBeFirst(round, props.roundResults),
    result: getRoundResult(round, props.roundResults),
  };
}));
const isSelected = (round: number) => props.clipMode ? props.selectedRounds.includes(round) : props.currentRound === round;
const roundList = ref<HTMLElement>();
watch(() => [props.currentRound, props.totalRounds, props.clipMode], async () => {
  if (props.clipMode) return;
  await nextTick();
  roundList.value?.querySelector<HTMLElement>(`[data-round="${props.currentRound}"]`)?.scrollIntoView({ block: 'nearest' });
}, { immediate: true, flush: 'post' });
</script>

<style scoped>
.replay-rounds { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 0 var(--ds-space-md); }
.rounds-heading, .selection-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-sm); flex-shrink: 0; }
.rounds-heading { height: 20px; padding: 0 10px; }
.rounds-heading h2 { display: flex; align-items: baseline; gap: var(--ds-space-sm); margin: 0; font-size: 12px; font-weight: 500; color: var(--ds-text-muted); }
.rounds-heading h2 span { font-size: 12px; font-weight: 400; color: var(--ds-text-muted); }
.text-button { display: inline-flex; align-items: center; justify-content: center; height: var(--sidebar-row-height); padding: 0 10px; background: transparent; border: 0; border-radius: var(--ds-radius-sm); color: var(--ds-text-tertiary); font-size: 12px; cursor: pointer; }
.text-button:hover:not(:disabled), .text-button[aria-pressed="true"] { background: var(--ds-surface-hover); color: var(--ds-text-primary); }
.rounds-hint, .rounds-empty { margin: 0; font-size: 12px; line-height: 1.6; color: var(--ds-text-tertiary); }
.rounds-empty { padding: var(--ds-space-lg) 0; }
.rounds-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 4px; width: 180px; margin: 0 auto; }
.round-row { flex-shrink: 0; display: flex; align-items: center; gap: 5px; width: 164px; height: var(--sidebar-row-height); margin: 0 auto; padding: 0 6px; border: 0; border-radius: var(--ds-radius-sm); background: transparent; color: var(--ds-text-secondary); font-size: 12px; cursor: pointer; transition: background .15s, color .15s; }
.round-row:hover:not(:disabled) { background: var(--ds-surface-hover); color: var(--ds-text-primary); }
.round-row.selected { background: var(--ds-surface-active); color: var(--ds-text-primary); }
.round-center { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }
.round-center > span { min-width: 1.5em; }
.round-center img { width: 14px; height: 14px; object-fit: contain; }
.economy-tag { padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 600; text-transform: capitalize; color: var(--ds-text-secondary); background: var(--ds-surface-base); }
.economy-tag.eco { color: var(--ds-success); background: color-mix(in srgb, var(--ds-success) 16%, transparent); }
.economy-tag.half { color: var(--ds-warning); background: color-mix(in srgb, var(--ds-warning) 16%, transparent); }
.economy-tag.full { color: var(--ds-danger); background: color-mix(in srgb, var(--ds-danger) 16%, transparent); }
.half-divider { flex-shrink: 0; height: 1px; background: var(--ds-border-default); margin: 6px 9px; }
.selection-mark { width: 14px; height: 14px; flex-shrink: 0; border: 1px solid var(--ds-border-strong); border-radius: 3px; }
.selection-mark svg { width: 100%; height: 100%; }
.selected .selection-mark { color: var(--ds-primary-text); background: var(--ds-primary); border-color: var(--ds-primary); }
.clip-actions { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; padding-top: 6px; border-top: 1px solid var(--ds-border-default); }
.selection-summary { color: var(--ds-text-tertiary); font-size: 12px; }
.merge-error { margin: 0; color: var(--ds-danger); font-size: 12px; overflow-wrap: anywhere; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: -2px; }
</style>
