<template>
  <div class="app-shell" :class="{ 'sidebar-open': isSidebarOpen }">
    <!-- 左侧侧边栏 -->
    <aside class="app-sidebar">
      <div class="sidebar-header">
        <h3>历史回放</h3>
        <button class="close-btn" @click="isSidebarOpen = false">×</button>
      </div>
      <div class="sidebar-content">
        <div v-if="!replayList.length" class="empty-list">
          暂无解析记录
        </div>
        <div
          v-for="item in replayList"
          :key="item.id"
          class="replay-item"
          :class="{ active: replay?.id === item.id }"
          :style="{ backgroundImage: `url(${getMapBg(item.mapName)})` }"
          @click="selectReplay(item.id!)"
        >
          <div class="replay-overlay">
            <div class="map-name">{{ item.mapName }}</div>
            <div class="match-info">
              <div class="teams">
                <span class="team-ct">{{ item.teamCT || 'CT' }}</span>
                <span class="vs">vs</span>
                <span class="team-t">{{ item.teamT || 'T' }}</span>
              </div>
              <div class="scores">
                <span class="score">{{ item.scoreCT }}</span>
                <span class="dash">-</span>
                <span class="score">{{ item.scoreT }}</span>
              </div>
            </div>
            <div class="replay-date">
              {{ formatDate(item.timestamp) }}
            </div>
            <button class="delete-item-btn" @click.stop="deleteReplayById(item.id!)">删除</button>
          </div>
        </div>
      </div>
    </aside>

    <div class="main-container">
      <header class="app-header">
        <div class="header-left">
          <button class="menu-toggle-btn" @click="isSidebarOpen = !isSidebarOpen">
            ☰
          </button>
          <div class="app-title">
            CS2 Demo Viewer
            <span>2D 战术回放预览</span>
          </div>
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
    </div>

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

const { parsing, statusMsg, parsingSteps, parseDemo, replayList, replay, loadReplayById, deleteReplayById } = useReplayData();
const fileInput = ref<HTMLInputElement | null>(null);
const isSidebarOpen = ref(true);

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

const selectReplay = (id: string) => {
  loadReplayById(id);
};

const formatDate = (ts?: number) => {
  if (!ts) return '未知时间';
  return new Date(ts).toLocaleString();
};

const getMapBg = (mapName: string) => {
  if (mapName.includes('dust2')) {
    return '/leftSideGroundMap/dust2_left.png';
  }
  // 默认背景或根据地图名称映射其他背景
  return '/backGroundMap/dust2.png'; 
};
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #111;
  color: #eee;
}

.app-sidebar {
  width: 0;
  height: 100%;
  background: #1a1a1a;
  border-right: 1px solid #333;
  transition: width 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-open .app-sidebar {
  width: 300px;
}

.sidebar-header {
  padding: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  white-space: nowrap;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.close-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 24px;
  cursor: pointer;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.empty-list {
  text-align: center;
  color: #666;
  margin-top: 50px;
}

.replay-item {
  height: 120px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  border: 2px solid transparent;
  flex-shrink: 0;
}

.replay-item.active {
  border-color: #3fa46a;
}

.replay-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: background 0.2s;
}

.replay-item:hover .replay-overlay {
  background: rgba(0, 0, 0, 0.2);
}

.map-name {
  font-weight: bold;
  font-size: 1.1rem;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.match-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.teams {
  font-size: 0.85rem;
  display: flex;
  gap: 5px;
  align-items: center;
}

.vs {
  color: #aaa;
  font-style: italic;
  font-size: 0.7rem;
}

.scores {
  font-weight: bold;
  font-size: 1.2rem;
  letter-spacing: 2px;
}

.replay-date {
  font-size: 0.75rem;
  color: #ccc;
  text-align: right;
}

.delete-item-btn {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(255, 0, 0, 0.6);
  border: none;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.replay-item:hover .delete-item-btn {
  opacity: 1;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.menu-toggle-btn {
  background: #333;
  border: 1px solid #444;
  color: #eee;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
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
