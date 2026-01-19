<template>
  <div class="app">
    <header class="app-header">
      <div class="app-title">
        CS2 Demo Viewer
        <span>2D 战术回放预览</span>
      </div>
      <div class="toolbar-right">
        <input
          type="file"
          accept=".dem"
          style="display: none"
          ref="fileInput"
          @change="onFileChange"
        />
        <button
          @click="triggerUpload"
          :disabled="parsing"
          :title="parsing ? statusMsg : '上传 .dem 文件进行解析'"
        >
          {{ parsing ? '解析中...' : '上传 Demo' }}
        </button>
      </div>
    </header>

    <main class="app-main">
      <div class="toolbar">
        <div>拖拽地图进行平移，滚轮缩放；底部时间轴控制回放进度。</div>
      </div>

      <ReplayPlayer />
    </main>

    <!-- 解析进度弹窗 -->
    <div v-if="parsing" class="parsing-overlay">
      <div class="parsing-modal">
        <h3>正在解析 Demo 文件</h3>
        <p class="parsing-status">{{ statusMsg }}</p>
        <div class="parsing-steps">
          <div
            v-for="(step, index) in parsingSteps"
            :key="index"
            class="step-item"
            :class="{ completed: step.completed }"
          >
            <div class="step-indicator">
              <span v-if="step.completed">✅</span>
              <span v-else>⏳</span>
            </div>
            <div class="step-content">
              <div class="step-name">{{ step.step }}</div>
              <div v-if="step.message" class="step-message">{{ step.message }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ReplayPlayer from '@/components/ReplayPlayer/ReplayPlayer.vue';
import { useReplayData } from '@/composables/useReplayData';

const { parsing, statusMsg, parsingSteps, parseDemo } = useReplayData();
const fileInput = ref<HTMLInputElement | null>(null);

const triggerUpload = () => {
  fileInput.value?.click();
};

const onFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    await parseDemo(file);
    // 重置 input 以允许再次选择相同文件
    target.value = '';
  }
};
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #111;
  color: #eee;
}

.app-header {
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.app-title {
  font-size: 1.5rem;
  font-weight: bold;
}

.app-title span {
  font-size: 0.9rem;
  color: #999;
  margin-left: 10px;
}

.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid #333;
  color: #aaa;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.parsing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.parsing-modal {
  background: #222;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 20px;
  width: 500px;
  max-width: 90vw;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
}

.parsing-modal h3 {
  margin: 0 0 15px 0;
  color: #fff;
  text-align: center;
}

.parsing-status {
  margin: 0 0 15px 0;
  color: #aaa;
  text-align: center;
  font-style: italic;
}

.parsing-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
}

.step-item.completed {
  background: rgba(51, 163, 102, 0.15);
}

.step-indicator {
  font-size: 18px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-name {
  font-weight: bold;
  color: #fff;
}

.step-message {
  font-size: 12px;
  color: #ccc;
  margin-top: 4px;
}
</style>
