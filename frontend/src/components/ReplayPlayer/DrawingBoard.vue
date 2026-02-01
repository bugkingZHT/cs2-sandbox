<template>
  <div class="drawing-board-container" :class="{ 'active': active }">
    <canvas
      ref="canvasRef"
      class="drawing-canvas"
      @mousedown="startDrawing"
      @mousemove="draw"
      @mouseup="stopDrawing"
      @mouseleave="stopDrawing"
    ></canvas>

    <!-- Toolbar -->
    <div v-if="active" class="drawing-toolbar">
      <div class="tool-group">
        <button 
          v-for="color in colors" 
          :key="color"
          class="color-btn"
          :style="{ backgroundColor: color }"
          :class="{ 'selected': currentColor === color }"
          @click="currentColor = color"
        ></button>
      </div>

      <div class="divider"></div>

      <div class="tool-group">
        <button 
          class="tool-btn" 
          :class="{ 'selected': mode === 'brush' }" 
          @click="mode = 'brush'"
          title="画笔"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l5 5"/>
            <path d="M11 11l1 1"/>
          </svg>
        </button>
        <button 
          class="tool-btn" 
          :class="{ 'selected': mode === 'rect' }" 
          @click="mode = 'rect'"
          title="框选"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          </svg>
        </button>
      </div>

      <div class="divider"></div>

      <div class="tool-group">
        <button class="tool-btn" @click="undo" title="回退">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 14L4 9l5-5"/>
            <path d="M4 9h12a5 5 0 0 1 5 5v2"/>
          </svg>
        </button>
        <button class="tool-btn" @click="clear" title="清屏">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>

      <div class="divider"></div>

      <div class="tool-group">
        <button class="tool-btn save-btn" @click="save" title="保存">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          <span>保存</span>
        </button>
        <button class="tool-btn close-btn" @click="$emit('close')" title="退出">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue';

const props = defineProps<{
  active: boolean;
  getBackgroundCanvas?: () => HTMLCanvasElement | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const ctx = ref<CanvasRenderingContext2D | null>(null);
const isDrawing = ref(false);
const currentColor = ref('#ff4d4f');
const mode = ref<'brush' | 'rect'>('brush');
const colors = ['#ff4d4f', '#52c41a', '#1890ff', '#fadb14', '#ffffff', '#000000'];

// History for undo
const history = ref<ImageData[]>([]);
const startPos = { x: 0, y: 0 };
let tempImageData: ImageData | null = null;

const initCanvas = () => {
  if (!canvasRef.value) return;
  const canvas = canvasRef.value;
  const parent = canvas.parentElement;
  if (!parent) return;

  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
  
  ctx.value = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx.value) {
    ctx.value.lineCap = 'round';
    ctx.value.lineJoin = 'round';
    ctx.value.lineWidth = 3;
  }
};

const startDrawing = (e: MouseEvent) => {
  if (!ctx.value || !canvasRef.value) return;
  
  isDrawing.value = true;
  const rect = canvasRef.value.getBoundingClientRect();
  startPos.x = e.clientX - rect.left;
  startPos.y = e.clientY - rect.top;

  // Save state for undo
  saveHistory();

  if (mode.value === 'brush') {
    ctx.value.beginPath();
    ctx.value.moveTo(startPos.x, startPos.y);
    ctx.value.strokeStyle = currentColor.value;
  } else {
    // For rect, save the current canvas state to restore while dragging
    tempImageData = ctx.value.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height);
  }
};

const draw = (e: MouseEvent) => {
  if (!isDrawing.value || !ctx.value || !canvasRef.value) return;

  const rect = canvasRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (mode.value === 'brush') {
    ctx.value.lineTo(x, y);
    ctx.value.stroke();
  } else if (mode.value === 'rect') {
    // Restore and draw rect
    if (tempImageData) {
      ctx.value.putImageData(tempImageData, 0, 0);
    }
    ctx.value.strokeStyle = currentColor.value;
    ctx.value.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
  }
};

const stopDrawing = () => {
  if (isDrawing.value && mode.value === 'brush' && ctx.value) {
    ctx.value.closePath();
  }
  isDrawing.value = false;
  tempImageData = null;
};

const saveHistory = () => {
  if (!ctx.value || !canvasRef.value) return;
  history.value.push(ctx.value.getImageData(0, 0, canvasRef.value.width, canvasRef.value.height));
  if (history.value.length > 20) {
    history.value.shift();
  }
};

const undo = () => {
  if (history.value.length === 0 || !ctx.value || !canvasRef.value) return;
  const lastState = history.value.pop();
  if (lastState) {
    ctx.value.putImageData(lastState, 0, 0);
  }
};

const clear = () => {
  if (!ctx.value || !canvasRef.value) return;
  saveHistory();
  ctx.value.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
};

const save = () => {
  if (!canvasRef.value) return;
  
  const drawingCanvas = canvasRef.value;
  
  // Use the provided function to get the background canvas
  let bgCanvas: HTMLCanvasElement | null = null;
  if (props.getBackgroundCanvas) {
    bgCanvas = props.getBackgroundCanvas();
  }
  
  // Fallback to querySelector if prop method fails
  if (!bgCanvas) {
    const parent = drawingCanvas.parentElement;
    bgCanvas = parent?.querySelector('.map-canvas-element canvas') as HTMLCanvasElement;
  }
  
  console.log('[DrawingBoard] Saving screenshot...', { 
    hasBgCanvas: !!bgCanvas, 
    bgWidth: bgCanvas?.width, 
    bgHeight: bgCanvas?.height,
    drawWidth: drawingCanvas.width,
    drawHeight: drawingCanvas.height,
    dpr: window.devicePixelRatio
  });
  
  if (bgCanvas) {
    const tempCanvas = document.createElement('canvas');
    // Important: Use background canvas's physical dimensions to ensure content is captured
    const targetWidth = bgCanvas.width;
    const targetHeight = bgCanvas.height;
    
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      // 1. Fill with background color in case of transparency
      tempCtx.fillStyle = '#000000';
      tempCtx.fillRect(0, 0, targetWidth, targetHeight);
      
      // 2. Draw background (PIXI canvas)
      tempCtx.drawImage(bgCanvas, 0, 0);
      
      // 3. Draw drawings (scaled to match physical pixels)
      tempCtx.drawImage(drawingCanvas, 0, 0, targetWidth, targetHeight);
      
      const link = document.createElement('a');
      link.download = `replay-edit-${new Date().getTime()}.png`;
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
      return;
    }
  }

  // Fallback to just saving the drawing if background canvas not found
  console.warn('[DrawingBoard] Background canvas not found for saving');
  const link = document.createElement('a');
  link.download = `drawing-${new Date().getTime()}.png`;
  link.href = canvasRef.value.toDataURL('image/png');
  link.click();
};

const resizeHandler = () => {
  if (props.active) {
    // When resizing, we might lose drawing if we just reset canvas size.
    // Ideally we should scale the drawing, but for a simple tool, resetting is okay 
    // or we can save/restore.
    const oldData = ctx.value?.getImageData(0, 0, canvasRef.value!.width, canvasRef.value!.height);
    initCanvas();
    if (oldData) {
      ctx.value?.putImageData(oldData, 0, 0);
    }
  }
};

watch(() => props.active, (newVal) => {
  if (newVal) {
    setTimeout(initCanvas, 0);
    window.addEventListener('resize', resizeHandler);
  } else {
    // Clear canvas when deactivating
    if (ctx.value && canvasRef.value) {
      ctx.value.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
      history.value = [];
    }
    window.removeEventListener('resize', resizeHandler);
  }
});

onMounted(() => {
  if (props.active) {
    initCanvas();
    window.addEventListener('resize', resizeHandler);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeHandler);
});
</script>

<style scoped>
.drawing-board-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: var(--ds-z-modal);
}

.drawing-board-container.active {
  pointer-events: all;
  background: rgba(0, 0, 0, 0.05); /* Very light overlay to indicate active mode */
}

.drawing-canvas {
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.drawing-toolbar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 20, 30, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid var(--ds-border-strong);
  border-radius: var(--ds-radius-md);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: var(--ds-shadow-2xl);
  pointer-events: all;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.divider {
  width: 1px;
  height: 24px;
  background: var(--ds-border-subtle);
}

.color-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s;
}

.color-btn.selected {
  border-color: #fff;
  transform: scale(1.2);
}

.tool-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--ds-radius-sm);
  background: transparent;
  border: none;
  color: var(--ds-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.tool-btn.selected {
  background: var(--ds-primary);
  color: #fff;
}

.save-btn {
  width: auto;
  padding: 0 12px;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  background: var(--ds-primary);
  color: #fff;
}

.save-btn:hover {
  background: var(--ds-primary-hover);
}

.close-btn:hover {
  color: var(--ds-danger);
}
</style>
