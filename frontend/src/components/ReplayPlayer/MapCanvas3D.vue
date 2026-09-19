<template>
  <div ref="container" class="map-canvas-3d">
    <div ref="viewport" class="sandbox-viewport"></div>
    <button v-if="firstPersonPlayerId !== undefined" class="exit-first-person" type="button"
      title="返回沙盘（Escape）" @click="emit('exit-first-person')">退出第一人称</button>
    <DrawingBoard
      :active="!!isDrawingMode"
      :get-background-canvas="getCanvas"
      @close="emit('close-drawing')"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Frame, ProjectileRenderConfig, ReplayMeta } from '@/types/replay';
import { PLAYER_DISPLAY_CONTROLS } from '@/config/map';
import { useMapDisplaySettings } from '@/composables/useMapDisplaySettings';
import { loadMapGeometry } from '@/composables/scene3d/mapGeometry';
import { sampleReplayFrame } from '@/composables/scene3d/sampleReplayFrame';
import { buildProjectileTrails, type ProjectileTrails } from '@/composables/scene3d/projectileTrails';
import { buildPlayerDeaths, type PlayerDeaths } from '@/composables/scene3d/playerDeaths';
import { buildPlayerFlashes, type PlayerFlashes } from '@/composables/scene3d/playerFlashes';
import { buildProjectileEffectStarts, type ProjectileEffectStarts } from '@/composables/scene3d/projectileEffects';
import { buildShotFlights, type ShotFlights } from '@/composables/scene3d/shotFlights';
import { buildSmokeDispersals, type SmokeDispersals } from '@/composables/scene3d/smokeDispersal';
import { SandboxScene } from '@/composables/scene3d/sandboxScene';
import DrawingBoard from './DrawingBoard.vue';

const props = withDefaults(defineProps<{
  frames?: Frame[];
  currentFrameIndex: number;
  currentTimeMs: number;
  replayMeta?: ReplayMeta;
  isPlaying?: boolean;
  isDragging?: boolean;
  mapName?: string;
  floorView?: 'upper' | 'middle' | 'lower';
  firstPersonPlayerId?: number;
  projectileConfigs?: Record<number, ProjectileRenderConfig>;
  hiddenPlayerIds?: number[];
  showMapProjectiles?: boolean;
  showMapDropped?: boolean;
  showMapBomb?: boolean;
  isDrawingMode?: boolean;
  grenadeTrackingEnabled?: boolean;
}>(), { showMapProjectiles: true, showMapDropped: true, showMapBomb: true, grenadeTrackingEnabled: true });

const emit = defineEmits<{
  (e: 'error', message: string): void;
  (e: 'player-click', playerId: number): void;
  (e: 'close-drawing'): void;
  (e: 'exit-first-person'): void;
}>();
const container = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const { playerSize, playerNameSize } = useMapDisplaySettings();
let sandbox: SandboxScene | null = null;
let abort: AbortController | undefined;
let animation = 0;
let mounted = false;
let generation = 0;
let dirty = true;
let lastTime = Number.NaN;
let lastFrameIndex = -1;
let failed = false;
let trailSource: Frame[] | undefined;
let projectileTrails: ProjectileTrails | undefined;
let playerDeaths: PlayerDeaths | undefined;
let playerFlashes: PlayerFlashes | undefined;
let projectileEffectStarts: ProjectileEffectStarts | undefined;
let shotFlights: ShotFlights | undefined;
let smokeDispersals: SmokeDispersals | undefined;
let smokeSource: Frame[] | undefined;
let smokeConfigs: typeof props.projectileConfigs;
let smokeMetaConfigs: ReplayMeta['projectileRenderConfig'];

function getCanvas() { return sandbox?.renderer.domElement || null; }
function resetView() { emit('exit-first-person'); sandbox?.resetView(); dirty = true; }
function reportError(error: unknown) {
  if (failed) return;
  failed = true;
  emit('error', error instanceof Error ? error.message : '无法初始化三维场景');
}
const contextLost = (event: Event) => {
  event.preventDefault();
  reportError(new Error('三维图形上下文已丢失，已切回二维视图'));
};

function tick() {
  if (!mounted || failed) return;
  try {
    if (sandbox) {
      sandbox.controls.enabled = !props.isDrawingMode && props.firstPersonPlayerId === undefined;
      if (dirty || lastTime !== props.currentTimeMs || lastFrameIndex !== props.currentFrameIndex) {
        if (trailSource !== props.frames) {
          trailSource = props.frames;
          projectileTrails = buildProjectileTrails(trailSource || []);
          playerDeaths = buildPlayerDeaths(trailSource || []);
          playerFlashes = buildPlayerFlashes(trailSource || []);
          projectileEffectStarts = buildProjectileEffectStarts(trailSource || []);
          shotFlights = buildShotFlights(trailSource || []);
        }
        if (smokeSource !== props.frames || smokeConfigs !== props.projectileConfigs || smokeMetaConfigs !== props.replayMeta?.projectileRenderConfig) {
          smokeSource = props.frames;
          smokeConfigs = props.projectileConfigs;
          smokeMetaConfigs = props.replayMeta?.projectileRenderConfig;
          smokeDispersals = buildSmokeDispersals(smokeSource || [], { ...smokeMetaConfigs, ...smokeConfigs });
        }
        // Paused seeks and grenade analysis also advance this clock independently of isPlaying.
        const frame = sampleReplayFrame(props.frames || [], props.currentTimeMs, props.currentFrameIndex);
        sandbox.update(frame, {
          currentTimeMs: props.currentTimeMs,
          firstPersonPlayerId: props.firstPersonPlayerId,
          projectileTrails,
          playerDeaths,
          playerFlashes,
          projectileEffectStarts,
          smokeDispersals,
          shotFlights,
          replayMeta: props.replayMeta,
          hiddenPlayerIds: props.hiddenPlayerIds,
          projectileConfigs: props.projectileConfigs,
          showMapProjectiles: props.showMapProjectiles,
          showMapDropped: props.showMapDropped,
          showMapBomb: props.showMapBomb,
          grenadeTrackingEnabled: props.grenadeTrackingEnabled,
          playerScale: playerSize.value / PLAYER_DISPLAY_CONTROLS.playerSize.default,
          nameScale: playerNameSize.value / PLAYER_DISPLAY_CONTROLS.playerNameSize.default,
        });
        if (props.firstPersonPlayerId !== undefined && sandbox.followPlayerId === undefined) emit('exit-first-person');
        lastTime = props.currentTimeMs;
        lastFrameIndex = props.currentFrameIndex;
        dirty = false;
      }
      sandbox.render();
    }
  } catch (error) {
    reportError(error);
    return;
  }
  animation = requestAnimationFrame(tick);
}

async function initialize() {
  if (!mounted || !viewport.value) return;
  const token = ++generation;
  abort?.abort();
  sandbox?.renderer.domElement.removeEventListener('webglcontextlost', contextLost);
  sandbox?.dispose();
  sandbox = null;
  failed = false;
  dirty = true;
  abort = new AbortController();
  try {
    const map = await loadMapGeometry(props.mapName || props.replayMeta?.mapName || '', abort.signal);
    if (!mounted || token !== generation || !viewport.value) return;
    sandbox = new SandboxScene(viewport.value, playerId => emit('player-click', playerId));
    sandbox.renderer.domElement.addEventListener('webglcontextlost', contextLost);
    sandbox.setMap(map);
    sandbox.setFloorView(props.floorView || 'upper');
    dirty = true;
  } catch (error) {
    if (token !== generation || !mounted || (error instanceof DOMException && error.name === 'AbortError')) return;
    reportError(error);
  }
}

watch(() => props.mapName || props.replayMeta?.mapName, initialize);
watch(() => props.floorView, value => sandbox?.setFloorView(value || 'upper'));
watch(() => [props.frames, props.replayMeta, props.projectileConfigs, props.hiddenPlayerIds?.join(','),
  props.showMapProjectiles, props.showMapDropped, props.showMapBomb, props.grenadeTrackingEnabled,
  props.firstPersonPlayerId,
  playerSize.value, playerNameSize.value], () => { dirty = true; });
onMounted(() => {
  mounted = true;
  void initialize();
  animation = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  mounted = false;
  generation++;
  cancelAnimationFrame(animation);
  abort?.abort();
  sandbox?.renderer.domElement.removeEventListener('webglcontextlost', contextLost);
  sandbox?.dispose();
  sandbox = null;
});
defineExpose({ getCanvas, resetView, getSandbox: () => sandbox, inspect: () => sandbox?.inspect() });
</script>

<style scoped>
.map-canvas-3d {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #e8e8e8;
  isolation: isolate;
}
.sandbox-viewport {
  position: absolute;
  inset: 0;
}
.exit-first-person {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  padding: 9px 14px;
  border: 1px solid var(--ds-border-default, #c5cbd1);
  border-radius: 8px;
  background: var(--ds-bg-secondary, #fff);
  color: var(--ds-text-primary, #28333f);
  box-shadow: 0 2px 8px #0002;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.exit-first-person:hover { background: var(--ds-bg-tertiary, #edf0f3); }
.exit-first-person:focus-visible { outline: 2px solid #8bc5ec; outline-offset: 2px; }
</style>
