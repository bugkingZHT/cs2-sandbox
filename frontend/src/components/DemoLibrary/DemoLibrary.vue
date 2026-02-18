<template>
  <div class="demo-library-page">
    <!-- Header 浮于 app 最上方，Teleport 到 App.vue 的 #app-page-header -->
    <Teleport to="#app-page-header">
      <div class="demo-library-header">
        <div class="header-content">
          <div class="filter-controls">
          <!-- 经济类型筛选（回合） -->
          <div class="filter-group">
            <div class="filter-buttons">
              <button
                class="filter-btn filter-btn-economy"
                :class="{ active: filterEconomyType === 'all' }"
                @click="filterEconomyType = 'all'"
              >全部</button>
              <button
                class="filter-btn filter-btn-economy eco"
                :class="{ active: filterEconomyType === 'eco' }"
                @click="filterEconomyType = 'eco'"
              >Eco</button>
              <button
                class="filter-btn filter-btn-economy half"
                :class="{ active: filterEconomyType === 'half' }"
                @click="filterEconomyType = 'half'"
              >Half</button>
              <button
                class="filter-btn filter-btn-economy full"
                :class="{ active: filterEconomyType === 'full' }"
                @click="filterEconomyType = 'full'"
              >Full</button>
              <button
                class="filter-btn filter-btn-economy pistol"
                :class="{ active: filterEconomyType === 'pistol' }"
                @click="filterEconomyType = 'pistol'"
              >Pistol</button>
            </div>
          </div>
          <!-- 地图筛选 -->
          <div class="filter-group">
            <div class="filter-dropdown-wrapper">
              <div 
                class="filter-tags-input" 
                :class="{ 'has-selection': filterMapNames.length > 0 }"
                @click="handleMapDropdownClick"
              >
                <span v-if="filterMapNames.length > 0" class="filter-selection-text">
                  {{ filterMapNames.join(', ') }}
                </span>
                <input 
                  v-else
                  type="text" 
                  v-model="filterMapNameInput" 
                  @focus="showMapDropdown = true"
                  @input="onMapInputChange"
                  placeholder="按地图筛选"
                  class="filter-tags-input-field"
                  autocomplete="off"
                />
                <span class="filter-icon" @click.stop="handleMapIconClick">
                  <svg v-if="filterMapNames.length === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </span>
              </div>
              <div v-if="showMapDropdown && filteredMapOptions.length > 0" class="filter-dropdown ds-scrollbar">
                <div 
                  v-for="mapName in filteredMapOptions" 
                  :key="mapName"
                  class="filter-dropdown-item"
                  :class="{ selected: filterMapNames.includes(mapName) }"
                  @click="toggleMapName(mapName)"
                >
                  <span class="dropdown-checkbox">
                    <svg v-if="filterMapNames.includes(mapName)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span class="dropdown-item-name">{{ mapName }}</span>
                  <span class="dropdown-item-count">({{ getMapDemoCount(mapName) }})</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 队伍筛选 -->
          <div class="filter-group">
            <div class="filter-dropdown-wrapper">
              <div 
                class="filter-tags-input" 
                :class="{ 'has-selection': filterTeamNames.length > 0 }"
                @click="handleTeamDropdownClick"
              >
                <span v-if="filterTeamNames.length > 0" class="filter-selection-text">
                  {{ filterTeamNames.join(', ') }}
                </span>
                <input 
                  v-else
                  type="text" 
                  v-model="filterTeamNameInput" 
                  @focus="showTeamDropdown = true"
                  @input="onTeamInputChange"
                  placeholder="按队伍名称筛选"
                  class="filter-tags-input-field"
                  autocomplete="off"
                />
                <span class="filter-icon" @click.stop="handleTeamIconClick">
                  <svg v-if="filterTeamNames.length === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </span>
              </div>
              <div v-if="showTeamDropdown && filteredTeamOptions.length > 0" class="filter-dropdown ds-scrollbar">
                <div 
                  v-for="teamName in filteredTeamOptions" 
                  :key="teamName"
                  class="filter-dropdown-item"
                  :class="{ selected: filterTeamNames.includes(teamName) }"
                  @click="toggleTeamName(teamName)"
                >
                  <span class="dropdown-checkbox">
                    <svg v-if="filterTeamNames.includes(teamName)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span class="dropdown-item-name">{{ teamName }}</span>
                  <span class="dropdown-item-count">({{ getTeamDemoCount(teamName) }})</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 玩家筛选 -->
          <div class="filter-group">
            <div class="filter-dropdown-wrapper">
              <div 
                class="filter-tags-input" 
                :class="{ 'has-selection': filterPlayerNames.length > 0 }"
                @click="handlePlayerDropdownClick"
              >
                <span v-if="filterPlayerNames.length > 0" class="filter-selection-text">
                  {{ filterPlayerNames.join(', ') }}
                </span>
                <input 
                  v-else
                  type="text" 
                  v-model="filterPlayerNameInput" 
                  @focus="showPlayerDropdown = true"
                  @input="onPlayerInputChange"
                  placeholder="按玩家名称筛选"
                  class="filter-tags-input-field"
                  autocomplete="off"
                />
                <span class="filter-icon" @click.stop="handlePlayerIconClick">
                  <svg v-if="filterPlayerNames.length === 0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </span>
              </div>
              <div v-if="showPlayerDropdown && filteredPlayerOptions.length > 0" class="filter-dropdown ds-scrollbar">
                <div 
                  v-for="playerName in filteredPlayerOptions" 
                  :key="playerName"
                  class="filter-dropdown-item"
                  :class="{ selected: filterPlayerNames.includes(playerName) }"
                  @click="togglePlayerName(playerName)"
                >
                  <span class="dropdown-checkbox">
                    <svg v-if="filterPlayerNames.includes(playerName)" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </span>
                  <span class="dropdown-item-name">{{ playerName }}</span>
                  <span class="dropdown-item-count">({{ getPlayerDemoCount(playerName) }})</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
        <div class="library-actions">
          <input
            type="file"
            ref="fileInputRef"
            accept=".dem"
            @change="onFileSelected"
            style="display: none"
          />
          <button class="ds-btn ds-btn-primary" @click="openUploadModal" :disabled="parsing">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>{{ parsing ? '解析中...' : '解析 DEMO' }}</span>
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Upload Demo Modal -->
    <div v-if="showUploadModal" class="upload-modal-overlay" @click="closeUploadModal">
      <div class="upload-modal ds-card ds-card-elevated" @click.stop>
        <!-- Close Button -->
        <button class="upload-modal-close" @click="closeUploadModal" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <!-- Modal Header -->
        <div class="upload-modal-header">
          <h3 class="upload-modal-title">解析 DEMO</h3>
          <p class="upload-modal-subtitle">导入您的 CS2 回放文件进行解析</p>
        </div>

        <!-- Drop Zone -->
        <div
          class="upload-drop-zone"
          :class="{ 'is-dragover': isUploadDragOver }"
          @click="triggerFileInput"
          @dragover.prevent="isUploadDragOver = true"
          @dragleave="isUploadDragOver = false"
          @drop.prevent="onUploadDrop"
        >
          <div class="upload-drop-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-1"/>
              <polyline points="9 15 12 12 15 15"/>
              <line x1="12" y1="12" x2="12" y2="21"/>
            </svg>
          </div>
          <p class="upload-drop-text-primary">拖拽或点击选择 .dem 文件上传</p>
          <p class="upload-drop-text-secondary">支持拖拽上传</p>
        </div>

        <!-- Supported Maps Info -->
        <div class="upload-info-section">
          <div class="upload-info-label">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>支持的地图（上传其他地图将导致解析失败）</span>
          </div>
          <p class="upload-info-text">{{ supportedMapNamesText }}</p>
        </div>

        <!-- Actions -->
        <div class="modal-actions">
          <!-- Cancel button removed as requested -->
        </div>
      </div>
    </div>

    <!-- Parsing Info Banner：仅在全局阻塞解析时显示，与 Cover 语义一致 -->
    <div v-if="parsing && !isDismissed" class="parsing-info-banner">
      <div class="banner-content">
        <svg class="banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span class="banner-text">解析过程中请勿关闭或刷新页面</span>
      </div>
      <button class="banner-close" @click="dismissBanner" title="关闭提示">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="ds-empty">
      <div class="ds-spinner" style="width: 40px; height: 40px; border-width: 4px;"></div>
      <p class="ds-empty-title" style="margin-top: 24px;">Loading...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="demoList.length === 0" class="ds-empty">
      <div class="ds-empty-icon">
        <img src="/icons/replay.svg" alt="No demos" class="empty-icon-svg" />
      </div>
      <h3 class="ds-empty-title">暂无 Demo 文件</h3>
      <p class="ds-empty-description">点击"上传"按钮开始解析 Demo</p>
    </div>

    <!-- Demo Bar List -->
    <div v-else class="demo-bar-list ds-scrollbar">
      <div
        v-for="demo in sortedDemoList"
        :key="demo.id"
        class="demo-bar-card"
        :class="{
          'is-parsing': demo.status === 0,
          'is-failed': demo.status === -1
        }"
      >
        <!-- Card background: leftSide map image (left 1/3) + gradient overlay -->
        <div class="demo-bar-card-bg" aria-hidden="true">
          <div class="demo-bar-card-bg-placeholder"></div>
          <div class="demo-bar-card-bg-img-wrap">
            <img
              v-if="getMapLeftSideImage(demo.mapName) && !barCardBgError[demo.id ?? '']"
              :src="getMapLeftSideImage(demo.mapName)!"
              alt=""
              class="demo-bar-card-bg-img"
              @error="(e) => onBarCardBgError(demo.id ?? '', e)"
            />
          </div>
          <div class="demo-bar-card-bg-mask"></div>
        </div>
        <!-- Content -->
        <div class="demo-bar-card-inner">
        <!-- Main row: Info + Delete -->
        <div class="demo-bar-middle">
          <div class="demo-bar-meta">
            <span class="demo-bar-map">{{ demo.mapName || 'Unknown Map' }}</span>
            <span class="demo-bar-score">
              <template v-if="demo.status === 1">
                <template v-if="scoreDisplayMap[demo.id ?? '']">
                  <span
                    :class="[
                      'demo-bar-score-mine',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'win' && 'demo-bar-score-winner',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'loss' && 'demo-bar-score-loser',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'draw' && 'demo-bar-score-draw'
                    ]"
                  >{{ scoreDisplayMap[demo.id ?? ''].myTeam }} {{ scoreDisplayMap[demo.id ?? ''].myScore }}</span>
                  <span class="demo-bar-score-divider"> : </span>
                  <span
                    :class="[
                      'demo-bar-score-theirs',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'win' && 'demo-bar-score-loser',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'loss' && 'demo-bar-score-winner',
                      scoreDisplayMap[demo.id ?? ''].myResult === 'draw' && 'demo-bar-score-draw'
                    ]"
                  >{{ scoreDisplayMap[demo.id ?? ''].theirScore }} {{ scoreDisplayMap[demo.id ?? ''].theirTeam }}</span>
                </template>
                <template v-else>
                  <span class="demo-bar-score-winner">{{ getWinnerTeam(demo) }} {{ getWinnerScore(demo) }}</span>
                  <span class="demo-bar-score-divider"> : </span>
                  <span class="demo-bar-score-loser">{{ getLoserScore(demo) }} {{ getLoserTeam(demo) }}</span>
                </template>
              </template>
            </span>
            <div class="demo-bar-spacer" aria-hidden="true"></div>
            <span class="demo-bar-file">{{ demo.fileName || '—' }}</span>
            <span class="demo-bar-time">{{ demo.uploadTime ? formatAbsoluteTime(demo.uploadTime) : '—' }}</span>
          </div>
          <!-- Parsing progress on bar -->
          <div v-if="demo.status === 0" class="demo-bar-parsing">
            <div class="demo-bar-parsing-bar">
              <div class="demo-bar-parsing-fill" :style="{ width: `${demo.parsingProgress || 0}%` }"></div>
            </div>
            <span class="demo-bar-parsing-text">{{ demo.parsingProgress || 0 }}%</span>
          </div>
        </div>
        </div>
        <!-- Footer row: round selector / error message (left) + delete (right) -->
        <div class="demo-bar-footer-row">
          <div class="demo-bar-footer-left">
          <div v-if="demo.status === 1 && (demo.totalRounds ?? 0) > 0" class="demo-bar-round-nav">
            <div class="demo-bar-round-buttons">
              <template v-for="r in (demo.totalRounds ?? 0)" :key="r">
                <div class="demo-bar-round-cell">
                  <button
                    type="button"
                    class="demo-bar-round-btn"
                    :class="{ 'is-filtered-out': filterEconomyType !== 'all' && !roundMatchesEconomyFilter(r, demo.roundResults, filterEconomyType) }"
                    :title="'播放回合 ' + r"
                    :disabled="filterEconomyType !== 'all' && !roundMatchesEconomyFilter(r, demo.roundResults, filterEconomyType)"
                    @click.stop="(filterEconomyType === 'all' || roundMatchesEconomyFilter(r, demo.roundResults, filterEconomyType)) && openReplayer(demo.uuid, r)"
                  >
                    <img
                      v-if="getRoundResultIcon(r, demo.roundResults) && shouldIconBeFirst(r, demo.roundResults)"
                      :src="getRoundResultIcon(r, demo.roundResults)!"
                      class="demo-bar-round-icon"
                      :alt="getRoundResult(r, demo.roundResults) || ''"
                    />
                    <span class="demo-bar-round-num">{{ r }}</span>
                    <img
                      v-if="getRoundResultIcon(r, demo.roundResults) && !shouldIconBeFirst(r, demo.roundResults)"
                      :src="getRoundResultIcon(r, demo.roundResults)!"
                      class="demo-bar-round-icon"
                      :alt="getRoundResult(r, demo.roundResults) || ''"
                    />
                  </button>
                  <div class="demo-bar-round-underline"></div>
                </div>
                <div v-if="r === 12" class="demo-bar-round-v-divider"></div>
              </template>
            </div>
          </div>
          <div v-else-if="demo.status === -1" class="demo-bar-failed-msg">{{ demo.parsingStatus || 'Parsing failed' }}</div>
          </div>
          <div class="demo-bar-footer-right">
            <button
              type="button"
              class="demo-bar-delete-btn"
              title="Delete"
              @click.stop="demo.status === 0 ? confirmForceDelete(demo) : confirmDelete(demo)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="delete-modal-overlay" @click="cancelDelete">
      <div class="delete-modal ds-card ds-card-elevated" @click.stop>
        <div class="modal-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">Confirm Deletion</h3>
        <p class="modal-message">
          Are you sure you want to delete <strong class="filename-truncate" :title="demoToDelete?.fileName || demoToDelete?.mapName">{{ demoToDelete?.fileName || demoToDelete?.mapName || 'this demo' }}</strong>?
        </p>
        <p class="modal-warning">This action cannot be undone</p>
        <div class="modal-actions">
          <button class="ds-btn ds-btn-secondary" @click="cancelDelete">Cancel</button>
          <button class="ds-btn ds-btn-danger" @click="performDelete">Delete</button>
        </div>
      </div>
    </div>

    <!-- Upload Blocked Warning Modal -->
    <div v-if="showUploadBlockedModal" class="delete-modal-overlay" @click="closeUploadBlockedModal">
      <div class="delete-modal ds-card ds-card-elevated" @click.stop>
        <div class="modal-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">Upload Blocked</h3>
        <p class="modal-message">
          已有解析任务正在进行中，请等待完成后再上传
        </p>
        <div v-if="uploadBlockedInfo" class="modal-info">
          <div class="modal-info-row">
            <span class="info-label">正在解析:</span>
            <span class="info-value filename-truncate" :title="uploadBlockedInfo.fileName">
              {{ uploadBlockedInfo.fileName }}
            </span>
          </div>
          <div class="modal-info-row">
            <span class="info-label">解析进度:</span>
            <span class="info-value">{{ uploadBlockedInfo.progress }}%</span>
          </div>
        </div>
        <p class="modal-warning">提示：为避免内存不足，系统限制同时只能解析一个 Demo 文件</p>
        <div class="modal-actions">
          <button class="ds-btn ds-btn-primary" @click="closeUploadBlockedModal">Got it</button>
        </div>
      </div>
    </div>

    <!-- Force Delete Confirmation Modal -->
    <div v-if="showForceDeleteModal" class="delete-modal-overlay" @click="cancelForceDelete">
      <div class="delete-modal ds-card ds-card-elevated" @click.stop>
        <div class="modal-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h3 class="modal-title">Force Delete Parsing Demo</h3>
        <p class="modal-message">
          Demo <strong class="filename-truncate" :title="demoToForceDelete?.fileName || demoToForceDelete?.mapName">{{ demoToForceDelete?.fileName || demoToForceDelete?.mapName }}</strong> is currently being parsed.
        </p>
        <div v-if="demoToForceDelete" class="modal-info">
          <div class="modal-info-row">
            <span class="info-label">Progress:</span>
            <span class="info-value">{{ demoToForceDelete.parsingProgress || 0 }}%</span>
          </div>
          <div class="modal-info-row">
            <span class="info-label">Status:</span>
            <span class="info-value">{{ demoToForceDelete.parsingStatus || 'Processing...' }}</span>
          </div>
        </div>
        <p class="modal-warning">
          ⚠️ Force deleting will terminate the parsing process and clean up all associated memory and storage.
        </p>
        <div class="modal-actions">
          <button class="ds-btn ds-btn-secondary" @click="cancelForceDelete">Cancel</button>
          <button class="ds-btn ds-btn-danger" @click="performForceDelete">Force Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import type { ReplayData } from '@/types/replay';
import { MAP_CONFIGS, SUPPORTED_PARSING_MAP_NAMES } from '@/config/map';
import { useReplayData } from '@/composables/useReplayData';
import { getMetaStorage } from '@/composables/indexdb-storage';
import { getRoundResult, getRoundResultIcon, shouldIconBeFirst, roundMatchesEconomyFilter } from '@/config/eco';
import { resolveTeamDisplayName } from '@/composables/teamDisplay';
import { navigate, getQuery, replaceLocation, pathRef, searchRef, saveReplayerReturnUrl } from '@/location';

const props = defineProps<{
  demoList: ReplayData[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select-demo', id: string): void;
  (e: 'delete-demo', id: string): void;
  (e: 'upload-demo', file: File): void;
  (e: 'upload-blocked', info: { fileName: string; progress: number }): void;
}>();

const { parsing, showUploadBlockedWarning } = useReplayData();

// Watch for upload blocked warnings from composable
watch(showUploadBlockedWarning, (warning) => {
  if (warning) {
    showUploadBlockedModal.value = true;
    uploadBlockedInfo.value = warning;
  }
});
const fileInputRef = ref<HTMLInputElement | null>(null);
const isLoadingDemo = ref(false);
const selectedDemoId = ref<string | null>(null);
const showDeleteModal = ref(false);
const demoToDelete = ref<ReplayData | null>(null);
const isDismissed = ref(false);

// Upload blocked modal state
const showUploadBlockedModal = ref(false);
const uploadBlockedInfo = ref<{ fileName: string; progress: number } | null>(null);

// Force delete modal state
const showForceDeleteModal = ref(false);
const demoToForceDelete = ref<ReplayData | null>(null);

function openReplayer(demoUuid: string, round: number) {
  saveReplayerReturnUrl();
  navigate('/replayer', `source=local&uuid=${encodeURIComponent(demoUuid)}&round=${round}`);
}

// Upload modal state (dashed drop zone)
const showUploadModal = ref(false);
const isUploadDragOver = ref(false);

// Filter state (real-time filtering)，与 URL 同步

function parseFiltersFromUrl(): {
  map: string[];
  team: string[];
  player: string[];
  economy: 'all' | 'eco' | 'half' | 'full' | 'pistol';
} {
  const q = getQuery();
  const map = (q.map ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const team = (q.team ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const player = (q.player ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const economy = (['all', 'eco', 'half', 'full', 'pistol'] as const).includes(q.economy as any)
    ? (q.economy as 'all' | 'eco' | 'half' | 'full' | 'pistol')
    : 'all';
  return { map, team, player, economy };
}

const filterMapNames = ref<string[]>([]);
const filterTeamNames = ref<string[]>([]);
const filterPlayerNames = ref<string[]>([]);
const filterEconomyType = ref<'all' | 'eco' | 'half' | 'full' | 'pistol'>('all');

function buildFilterSearch(): string {
  const params = new URLSearchParams();
  if (filterMapNames.value.length > 0) params.set('map', filterMapNames.value.join(','));
  if (filterTeamNames.value.length > 0) params.set('team', filterTeamNames.value.join(','));
  if (filterPlayerNames.value.length > 0) params.set('player', filterPlayerNames.value.join(','));
  if (filterEconomyType.value !== 'all') params.set('economy', filterEconomyType.value);
  const s = params.toString();
  return s ? '?' + s : '';
}

// Input states
const filterMapNameInput = ref('');
const filterTeamNameInput = ref('');
const filterPlayerNameInput = ref('');
const showMapDropdown = ref(false);
const showTeamDropdown = ref(false);
const showPlayerDropdown = ref(false);
const allTeamNames = ref<string[]>([]);
const allPlayerNames = ref<string[]>([]);

// Filtered map options based on input (derived from demoList)
const filteredMapOptions = computed(() => {
  const mapCounts = new Map<string, number>();
  props.demoList.forEach(demo => {
    const mapName = (demo.mapName || '').trim();
    if (mapName) {
      mapCounts.set(mapName, (mapCounts.get(mapName) || 0) + 1);
    }
  });
  let maps = [...mapCounts.keys()];
  if (filterMapNameInput.value.trim()) {
    const search = filterMapNameInput.value.toLowerCase();
    maps = maps.filter(name => name.toLowerCase().includes(search));
  }
  return maps.sort((a, b) => {
    const countA = mapCounts.get(a) || 0;
    const countB = mapCounts.get(b) || 0;
    return countB - countA;
  });
});

// Filtered team options based on input
const filteredTeamOptions = computed(() => {
  // Count demos for each team (use resolved display names)
  const teamCounts = new Map<string, number>();
  props.demoList.forEach(demo => {
    const ctName = getTeamDisplayName(demo, 'ct');
    const tName = getTeamDisplayName(demo, 't');
    if (ctName !== '—') teamCounts.set(ctName, (teamCounts.get(ctName) || 0) + 1);
    if (tName !== '—') teamCounts.set(tName, (teamCounts.get(tName) || 0) + 1);
  });
  
  let teams = allTeamNames.value;
  
  // Filter by input if provided
  if (filterTeamNameInput.value.trim()) {
    const search = filterTeamNameInput.value.toLowerCase();
    teams = teams.filter(name => name.toLowerCase().includes(search));
  }
  
  // Sort by demo count (descending)
  return teams.sort((a, b) => {
    const countA = teamCounts.get(a) || 0;
    const countB = teamCounts.get(b) || 0;
    return countB - countA;
  });
});

// Filtered player options based on input
const filteredPlayerOptions = computed(() => {
  // Count demos for each player
  const playerCounts = new Map<string, number>();
  props.demoList.forEach(demo => {
    if (demo.serverPlayer && Array.isArray(demo.serverPlayer)) {
      demo.serverPlayer.forEach(player => {
        if (player.name && player.name.trim()) {
          const name = player.name.trim();
          playerCounts.set(name, (playerCounts.get(name) || 0) + 1);
        }
      });
    }
  });
  
  let players = allPlayerNames.value;
  
  // Filter by input if provided
  if (filterPlayerNameInput.value.trim()) {
    const search = filterPlayerNameInput.value.toLowerCase();
    players = players.filter(name => name.toLowerCase().includes(search));
  }
  
  // Sort by demo count (descending)
  return players.sort((a, b) => {
    const countA = playerCounts.get(a) || 0;
    const countB = playerCounts.get(b) || 0;
    return countB - countA;
  });
});

// Get demo count for a map
const getMapDemoCount = (mapName: string): number => {
  let count = 0;
  props.demoList.forEach(demo => {
    if ((demo.mapName || '').trim() === mapName) count++;
  });
  return count;
};

// Get demo count for a team (match by resolved display name)
const getTeamDemoCount = (teamName: string): number => {
  let count = 0;
  props.demoList.forEach(demo => {
    if (getTeamDisplayName(demo, 'ct') === teamName || getTeamDisplayName(demo, 't') === teamName) {
      count++;
    }
  });
  return count;
};

// Get demo count for a player
const getPlayerDemoCount = (playerName: string): number => {
  let count = 0;
  props.demoList.forEach(demo => {
    if (demo.serverPlayer && Array.isArray(demo.serverPlayer)) {
      const hasPlayer = demo.serverPlayer.some(player => 
        player.name && player.name.trim() === playerName
      );
      if (hasPlayer) count++;
    }
  });
  return count;
};

// Load team names from IndexedDB
const loadTeamNames = async () => {
  try {
    const metaStorage = await getMetaStorage();
    if (metaStorage) {
      allTeamNames.value = await metaStorage.getAllTeamNames();
    }
  } catch (error) {
    console.error('[DemoLibrary] Failed to load team names:', error);
    allTeamNames.value = [];
  }
};

// Load player names from IndexedDB
const loadPlayerNames = async () => {
  try {
    const metaStorage = await getMetaStorage();
    if (metaStorage) {
      allPlayerNames.value = await metaStorage.getAllPlayerNames();
    }
  } catch (error) {
    console.error('[DemoLibrary] Failed to load player names:', error);
    allPlayerNames.value = [];
  }
};

// Toggle player name (single-select)
const togglePlayerName = (playerName: string) => {
  const index = filterPlayerNames.value.indexOf(playerName);
  if (index > -1) {
    // If clicking the same player, deselect it
    filterPlayerNames.value.splice(index, 1);
  } else {
    // Single-select: replace current selection
    filterPlayerNames.value = [playerName];
  }
  filterPlayerNameInput.value = ''; // Clear input after selection
  showPlayerDropdown.value = false; // Close dropdown after selection
};

// Remove player tag
const removePlayerTag = (playerName: string) => {
  const index = filterPlayerNames.value.indexOf(playerName);
  if (index > -1) {
    filterPlayerNames.value.splice(index, 1);
  }
};

// Clear all player tags
const clearAllPlayerTags = () => {
  filterPlayerNames.value = [];
  filterPlayerNameInput.value = '';
};

// Toggle map name (single-select)
const toggleMapName = (mapName: string) => {
  const index = filterMapNames.value.indexOf(mapName);
  if (index > -1) {
    filterMapNames.value.splice(index, 1);
  } else {
    filterMapNames.value = [mapName];
  }
  filterMapNameInput.value = '';
  showMapDropdown.value = false;
};

// Clear all map tags
const clearAllMapTags = () => {
  filterMapNames.value = [];
  filterMapNameInput.value = '';
};

// Toggle team name (single-select)
const toggleTeamName = (teamName: string) => {
  const index = filterTeamNames.value.indexOf(teamName);
  if (index > -1) {
    // If clicking the same team, deselect it
    filterTeamNames.value.splice(index, 1);
  } else {
    // Single-select: replace current selection
    filterTeamNames.value = [teamName];
  }
  filterTeamNameInput.value = ''; // Clear input after selection
  showTeamDropdown.value = false; // Close dropdown after selection
};

// Remove team tag
const removeTeamTag = (teamName: string) => {
  const index = filterTeamNames.value.indexOf(teamName);
  if (index > -1) {
    filterTeamNames.value.splice(index, 1);
  }
};

// Clear all team tags
const clearAllTeamTags = () => {
  filterTeamNames.value = [];
  filterTeamNameInput.value = '';
};

// Handle team input change
const onTeamInputChange = () => {
  showTeamDropdown.value = true;
};

// Handle player input change
const onPlayerInputChange = () => {
  showPlayerDropdown.value = true;
};

// Handle player dropdown click
const handlePlayerDropdownClick = () => {
  showPlayerDropdown.value = true;
};

// Handle player icon click (clear or toggle dropdown)
const handlePlayerIconClick = () => {
  if (filterPlayerNames.value.length > 0) {
    clearAllPlayerTags();
  }
};

// Handle map dropdown click
const handleMapDropdownClick = () => {
  showMapDropdown.value = true;
};

// Handle map icon click
const handleMapIconClick = () => {
  if (filterMapNames.value.length > 0) {
    clearAllMapTags();
  }
};

// Handle map input change
const onMapInputChange = () => {
  showMapDropdown.value = true;
};

// Handle team dropdown click
const handleTeamDropdownClick = () => {
  showTeamDropdown.value = true;
};

// Handle team icon click (clear or toggle dropdown)
const handleTeamIconClick = () => {
  if (filterTeamNames.value.length > 0) {
    clearAllTeamTags();
  }
};

// Close dropdown when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.filter-dropdown-wrapper')) {
    showMapDropdown.value = false;
    showTeamDropdown.value = false;
    showPlayerDropdown.value = false;
  }
};

// Defensive: list may briefly show status=0 before loadAllReplays marks them interrupted
const hasParsingDemos = computed(() => props.demoList.some(demo => demo.status === 0));

// Reset dismiss state when blocking parse starts
watch(parsing, (newVal) => {
  if (newVal) {
    isDismissed.value = false;
  }
});

const dismissBanner = () => {
  isDismissed.value = true;
};

// Init filters from URL on mount
onMounted(() => {
  const { map, team, player, economy } = parseFiltersFromUrl();
  filterMapNames.value = map;
  filterTeamNames.value = team;
  filterPlayerNames.value = player;
  filterEconomyType.value = economy;

  loadTeamNames(); // Load team names from IndexedDB
  loadPlayerNames(); // Load player names from IndexedDB

  // Add click outside listener for dropdown
  document.addEventListener('click', handleClickOutside);

  // Cleanup on unmount
  return () => {
    document.removeEventListener('click', handleClickOutside);
  };
});

// Sync filters to URL when changed
watch(
  () => [
    filterMapNames.value.slice(),
    filterTeamNames.value.slice(),
    filterPlayerNames.value.slice(),
    filterEconomyType.value,
  ],
  () => {
    replaceLocation(pathRef.value || '/demolib', buildFilterSearch());
  },
  { deep: true }
);

// React to browser back/forward (URL changed externally)
watch(searchRef, () => {
  const { map, team, player, economy } = parseFiltersFromUrl();
  const same =
    map.length === filterMapNames.value.length &&
    map.every((m, i) => m === filterMapNames.value[i]) &&
    team.length === filterTeamNames.value.length &&
    team.every((t, i) => t === filterTeamNames.value[i]) &&
    player.length === filterPlayerNames.value.length &&
    player.every((p, i) => p === filterPlayerNames.value[i]) &&
    economy === filterEconomyType.value;
  if (same) return;
  filterMapNames.value = map;
  filterTeamNames.value = team;
  filterPlayerNames.value = player;
  filterEconomyType.value = economy;
});

watch(() => props.demoList.length, () => {
  loadTeamNames(); // Reload team names when demo list changes
  loadPlayerNames(); // Reload player names when demo list changes
});

// Watch for parsing completion (status change from 0 to 1)
watch(() => props.demoList.map(d => ({ id: d.id, status: d.status })), (newList, oldList) => {
  if (!oldList) return;
  
  // Check if any demo changed from parsing (0) to complete (1)
  const hasCompletedParsing = newList.some((newDemo, index) => {
    const oldDemo = oldList[index];
    return oldDemo && oldDemo.status === 0 && newDemo.status === 1;
  });
  
  if (hasCompletedParsing) {
    console.log('[DemoLibrary] Demo parsing completed, refreshing player and team indexes');
    loadTeamNames();
    loadPlayerNames();
  }
}, { deep: true });

const sortedDemoList = computed(() => {
  let filteredList = [...props.demoList];
  
  // Filter by map names (support multiple)
  if (filterMapNames.value.length > 0) {
    filteredList = filteredList.filter(demo => {
      const mapName = (demo.mapName || '').trim();
      return filterMapNames.value.some(name => mapName === name);
    });
  }
  
  // Filter by team names (support multiple, match resolved display names)
  if (filterTeamNames.value.length > 0) {
    filteredList = filteredList.filter(demo => {
      const teamCT = getTeamDisplayName(demo, 'ct').toLowerCase();
      const teamT = getTeamDisplayName(demo, 't').toLowerCase();
      return filterTeamNames.value.some(searchTerm => {
        const term = searchTerm.toLowerCase();
        return teamCT.includes(term) || teamT.includes(term);
      });
    });
  }
  
  // Filter by player names (support multiple)
  if (filterPlayerNames.value.length > 0) {
    filteredList = filteredList.filter(demo => {
      if (!demo.serverPlayer || !Array.isArray(demo.serverPlayer)) {
        return false;
      }
      return filterPlayerNames.value.some(searchTerm => {
        const term = searchTerm.toLowerCase();
        return demo.serverPlayer!.some(player => 
          player.name && player.name.toLowerCase().includes(term)
        );
      });
    });
  }
  
  // Sort by timestamp (newest first)
  return filteredList.sort((a, b) => {
    return (b.timestamp || 0) - (a.timestamp || 0);
  });
});

const openUploadModal = () => {
  if (parsing.value) return;
  showUploadModal.value = true;
};

const closeUploadModal = () => {
  showUploadModal.value = false;
  isUploadDragOver.value = false;
};

const supportedMapNamesText = computed(() =>
  [...SUPPORTED_PARSING_MAP_NAMES].join('，')
);

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const onFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    if (showUploadModal.value) closeUploadModal();
    emit('upload-demo', file);
    input.value = ''; // Reset input
  }
};

const onUploadDrop = (e: DragEvent) => {
  isUploadDragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.name.toLowerCase().endsWith('.dem')) return;
  closeUploadModal();
  emit('upload-demo', file);
};

const selectDemo = async (demo: ReplayData) => {
  // 阻止选择正在解析或失败的 demo
  // status: 0=解析中, 1=完成, -1=失败
  if (demo.status === 0 || 
      demo.status === -1 || 
      isLoadingDemo.value || 
      !demo.id) {
    console.log('[SelectDemo] 阻止选择 - demo 正在解析或失败:', {
      uuid: demo.uuid,
      status: demo.status,
      parsingProgress: demo.parsingProgress
    });
    return;
  }
  
  isLoadingDemo.value = true;
  selectedDemoId.value = demo.id;
  
  // Emit select event
  emit('select-demo', demo.id);
  
  // Wait for loading animation
  await new Promise(resolve => setTimeout(resolve, 200));
  
  isLoadingDemo.value = false;
  selectedDemoId.value = null;
};

const confirmDelete = (demo: ReplayData) => {
  demoToDelete.value = demo;
  showDeleteModal.value = true;
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  demoToDelete.value = null;
};

const performDelete = () => {
  if (demoToDelete.value?.id) {
    emit('delete-demo', demoToDelete.value.id);
  }
  cancelDelete();
};

const confirmForceDelete = (demo: ReplayData) => {
  demoToForceDelete.value = demo;
  showForceDeleteModal.value = true;
};

const cancelForceDelete = () => {
  showForceDeleteModal.value = false;
  demoToForceDelete.value = null;
};

const performForceDelete = async () => {
  if (!demoToForceDelete.value?.id) {
    cancelForceDelete();
    return;
  }

  const uuid = demoToForceDelete.value.id;
  
  try {
    console.log(`[ForceDelete] Starting force delete for UUID: ${uuid}`);
    
    // Step 1: Close WASM parser to release Go memory
    if (typeof (window as any).closeDemoParser === 'function') {
      (window as any).closeDemoParser();
      console.log('[ForceDelete] 🗑️ WASM parser closed');
    }
    
    // Step 2: Trigger GC to clean up memory
    if (typeof (globalThis as any).gc === 'function') {
      (globalThis as any).gc();
      console.log('[ForceDelete] 🗑️ Explicit GC triggered');
    }
    
    // Step 3: Delete demo (this will clean up IndexedDB + OPFS)
    emit('delete-demo', uuid);
    console.log('[ForceDelete] ✅ Demo deleted successfully');
    
    // Step 4: Force page reload to kill all worker threads
    console.log('[ForceDelete] 🔄 Reloading page to terminate all workers...');
    setTimeout(() => {
      window.location.reload();
    }, 300); // Small delay to ensure deletion completes
    
  } catch (error) {
    console.error('[ForceDelete] Error during force delete:', error);
    // Still reload on error to ensure workers are terminated
    setTimeout(() => {
      window.location.reload();
    }, 300);
  } finally {
    cancelForceDelete();
  }
};

const closeUploadBlockedModal = () => {
  showUploadBlockedModal.value = false;
  uploadBlockedInfo.value = null;
  // Clear warning state in composable
  showUploadBlockedWarning.value = null;
};

const getMapLeftSideImage = (mapName: string | undefined): string | undefined => {
  if (!mapName) return undefined;
  const config = MAP_CONFIGS[mapName];
  return config?.leftSideGroundMap;
};

const barCardBgError = ref<Record<string, boolean>>({});
const onBarCardBgError = (demoId: string, _event: Event) => {
  barCardBgError.value = { ...barCardBgError.value, [demoId]: true };
};

const onImageError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

const formatDate = (timestamp: number | undefined) => {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return date.toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatAbsoluteTime = (timestamp: number | undefined) => {
  if (!timestamp) return '未知时间';
  const date = new Date(timestamp);
  
  return date.toLocaleString('zh-CN', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getTeamDisplayName = (demo: ReplayData, side: 'ct' | 't') =>
  resolveTeamDisplayName(
    side === 'ct' ? (demo.teamCT ?? '') : (demo.teamT ?? ''),
    side === 'ct' ? 3 : 2,
    demo.serverPlayer
  );

const getWinnerTeam = (demo: ReplayData) => {
  return (demo.scoreCT || 0) > (demo.scoreT || 0)
    ? getTeamDisplayName(demo, 'ct')
    : getTeamDisplayName(demo, 't');
};

const getLoserTeam = (demo: ReplayData) => {
  return (demo.scoreCT || 0) > (demo.scoreT || 0)
    ? getTeamDisplayName(demo, 't')
    : getTeamDisplayName(demo, 'ct');
};

const getWinnerScore = (demo: ReplayData) => {
  return Math.max(demo.scoreCT || 0, demo.scoreT || 0);
};

const getLoserScore = (demo: ReplayData) => {
  return Math.min(demo.scoreCT || 0, demo.scoreT || 0);
};

const getTeamClass = (demo: ReplayData, type: 'winner' | 'loser') => {
  if (type === 'winner') {
    return 'winner';
  }
  return 'loser';
};

// Get player win/loss status for a demo
const getPlayerWinLoss = (demo: ReplayData, playerName: string): 'win' | 'loss' | 'draw' | null => {
  if (!demo.serverPlayer || !Array.isArray(demo.serverPlayer)) {
    return null;
  }
  
  // Find the player in serverPlayer array
  const player = demo.serverPlayer.find(p => p.name === playerName);
  if (!player) {
    return null;
  }
  
  // Check for draw
  const scoreCT = demo.scoreCT || 0;
  const scoreT = demo.scoreT || 0;
  if (scoreCT === scoreT) {
    return 'draw';
  }
  
  // Determine which team won
  const ctWon = scoreCT > scoreT;
  
  // Check if player's team won
  // team: 2 = T, 3 = CT
  if (player.team === 3) {
    // Player is CT
    return ctWon ? 'win' : 'loss';
  } else if (player.team === 2) {
    // Player is T
    return ctWon ? 'loss' : 'win';
  }
  
  return null;
};

type ScoreDisplayWithFilter = {
  myTeam: string;
  myScore: number;
  theirTeam: string;
  theirScore: number;
  myResult: 'win' | 'loss' | 'draw';
};

/** When player filter is on: return { myTeam, myScore, theirTeam, theirScore, myResult } for score display (my side first, colored by win/loss/draw). */
const getScoreDisplayWithPlayerFilter = (demo: ReplayData): {
  myTeam: string;
  myScore: number;
  theirTeam: string;
  theirScore: number;
  myResult: 'win' | 'loss' | 'draw';
} | null => {
  if (filterPlayerNames.value.length === 0 || !demo.serverPlayer?.length) return null;
  const scoreCT = demo.scoreCT || 0;
  const scoreT = demo.scoreT || 0;
  for (const filterName of filterPlayerNames.value) {
    const term = filterName.toLowerCase();
    const player = demo.serverPlayer.find(p => p.name && p.name.toLowerCase().includes(term));
    if (!player) continue;
    const myResult = getPlayerWinLoss(demo, player.name);
    if (myResult === null) continue;
    const isCT = player.team === 3;
    return {
      myTeam: isCT ? getTeamDisplayName(demo, 'ct') : getTeamDisplayName(demo, 't'),
      myScore: isCT ? scoreCT : scoreT,
      theirTeam: isCT ? getTeamDisplayName(demo, 't') : getTeamDisplayName(demo, 'ct'),
      theirScore: isCT ? scoreT : scoreCT,
      myResult,
    };
  }
  return null;
};

const scoreDisplayMap = computed(() => {
  const map: Record<string, ScoreDisplayWithFilter> = {};
  for (const demo of sortedDemoList.value) {
    const r = getScoreDisplayWithPlayerFilter(demo);
    if (r) map[demo.id ?? ''] = r;
  }
  return map;
});
</script>

<style scoped>
/* === GitHub dark theme === */
.demo-library-page {
  --gh-bg: #0d1117;
  --gh-bg-secondary: #161b22;
  --gh-bg-tertiary: #21262d;
  --gh-border: #30363d;
  --gh-card: #21262d;
  --gh-text: #c9d1d9;
  --gh-text-muted: #8b949e;
}

/* === Page Layout === */
.demo-library-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--gh-bg);
  overflow: hidden;
}

/* === Empty State Centered === */
.ds-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-lg);
}

.ds-empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.empty-icon-svg {
  width: 80px;
  height: 80px;
  opacity: 0.5;
  filter: brightness(0.8);
}

.ds-empty-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--gh-text);
  margin: 0;
}

.ds-empty-description {
  font-size: var(--ds-text-base);
  color: var(--gh-text-muted);
  margin: 0;
  text-align: center;
}

/* === Header Styles === */
.demo-library-header {
  position: relative;
  z-index: 100;
  padding: 18px var(--ds-space-xl) 0 var(--ds-space-xl);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  background: linear-gradient(to bottom, var(--ds-bg-secondary) 0%, var(--ds-bg-primary-solid) 100%);
  border-bottom: 1px solid var(--gh-border);
  min-height: 60px;
}

/* === Parsing Info Banner === */
.parsing-info-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: linear-gradient(135deg, rgba(var(--ds-primary-rgb), 0.12) 0%, rgba(var(--ds-primary-rgb), 0.06) 100%);
  border-bottom: 1px solid var(--ds-border-default);
  border-top: 1px solid var(--ds-border-subtle);
  backdrop-filter: blur(8px);
  flex-shrink: 0;
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.banner-content {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  flex: 1;
}

.banner-icon {
  color: var(--ds-primary);
  flex-shrink: 0;
  animation: pulse-info 2s ease-in-out infinite;
}

@keyframes pulse-info {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(1.05);
  }
}

.banner-text {
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
  line-height: 1.5;
}

.banner-close {
  padding: var(--ds-space-xs);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.banner-close:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--ds-border-subtle);
  color: var(--ds-text-primary);
}

.banner-close:active {
  transform: scale(0.95);
}

.header-content {
  flex: 1;
}

.library-title {
  font-size: var(--ds-text-xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-xs) 0;
  letter-spacing: -0.3px;
}

.library-subtitle {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  margin: 0;
}

/* === Demo Bar List (GitHub dark) === */
.demo-bar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-md);
}

.demo-bar-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border: none;
  border-radius: 10px;
  color: var(--gh-text);
  position: relative;
  overflow: hidden;
  background: var(--gh-bg-secondary);
}

.demo-bar-card-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.demo-bar-card-bg-placeholder {
  position: absolute;
  inset: 0;
  background: var(--gh-bg-secondary);
}

.demo-bar-card-bg-img-wrap {
  position: absolute;
  left: 0;
  top: 0;
  width: 33.333%;
  height: 100%;
  overflow: hidden;
}

/* 右侧渐变隐入卡片背景色，避免图片硬边 */
.demo-bar-card-bg-img-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to right,
    transparent 0%,
    transparent 35%,
    var(--gh-bg-secondary) 100%
  );
  pointer-events: none;
}

.demo-bar-card-bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: left center;
  opacity: 0.5;
  filter: brightness(0.8) saturate(0.95);
}

.demo-bar-card-bg-mask {
  position: absolute;
  inset: 0;
  /* 遮罩过渡与卡片背景 secondary 一致 (#161b22) */
  background: linear-gradient(
    to right,
    rgba(22, 27, 34, 0.75) 0%,
    rgba(22, 27, 34, 0.5) 28%,
    rgba(22, 27, 34, 0.92) 35%,
    var(--gh-bg-secondary) 100%
  );
}

.demo-bar-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--ds-space-lg);
  padding: var(--ds-space-lg) var(--ds-space-xl);
  flex-wrap: wrap;
}

.demo-bar-card-inner > .demo-bar-middle {
  order: 1;
  flex: 1;
  min-width: 0;
}

.demo-bar-middle {
  padding-right: var(--ds-space-sm);
  overflow: hidden;
}

/* 主信息区：地图(=time宽) | 比分(左) | 空站位 | 文件名 | 时间(=map宽) */
.demo-bar-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 2fr) 135px;
  align-items: center;
  column-gap: 22px;
  row-gap: var(--ds-space-md);
  width: 100%;
  min-width: 0;
  line-height: 1.4;
  overflow: hidden;
}

.demo-bar-spacer {
  min-width: 0;
}

.demo-bar-map {
  font-weight: 700;
  font-size: 14px;
  color: var(--gh-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* 比分区：靠左，背景 + mono 字体 */
.demo-bar-score {
  justify-self: start;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 0 10px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: var(--ds-font-mono);
  letter-spacing: 0.03em;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 4px 10px;
}

.demo-bar-score-mine,
.demo-bar-score-theirs {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.demo-bar-score-mine,
.demo-bar-score-winner {
  justify-self: end;
  text-align: right;
}

.demo-bar-score-theirs,
.demo-bar-score-loser {
  justify-self: start;
  text-align: left;
}

.demo-bar-score-mine,
.demo-bar-score-theirs,
.demo-bar-score-winner,
.demo-bar-score-loser,
.demo-bar-score-draw {
  line-height: 1.3;
  display: inline-flex;
  align-items: center;
  font-size: inherit;
  font-variant-numeric: tabular-nums;
  font-family: inherit;
  letter-spacing: inherit;
}

.demo-bar-score-divider {
  flex-shrink: 0;
  color: var(--gh-text-muted);
  font-weight: 500;
  font-size: 0.95em;
  line-height: 1.3;
  font-family: inherit;
}

.demo-bar-score-winner {
  color: #3fb950;
  font-weight: 700;
}

.demo-bar-score-loser {
  color: #f85149;
  font-weight: 600;
}

.demo-bar-score-draw {
  color: var(--gh-text-muted);
  font-weight: 600;
}

.demo-bar-file {
  color: var(--gh-text-muted);
  font-size: 12px;
  font-weight: 500;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
  justify-self: end;
  text-align: right;
}

.demo-bar-time {
  color: var(--gh-text-muted);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
  letter-spacing: 0.02em;
  justify-self: end;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.demo-bar-parsing {
  margin-top: var(--ds-space-xs);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.demo-bar-parsing-bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.demo-bar-parsing-fill {
  height: 100%;
  background: #58a6ff;
  border-radius: 3px;
  transition: width 0.2s ease;
}

.demo-bar-parsing-text {
  font-size: 12px;
  color: var(--gh-text-muted);
  min-width: 2.5em;
}

.demo-bar-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--gh-border);
  border-radius: 6px;
  color: var(--gh-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-bar-delete-btn:hover {
  color: #f85149;
  border-color: rgba(248, 81, 73, 0.5);
  background: rgba(248, 81, 73, 0.1);
}

/* Footer row: round selector / error message (left) + delete (right) */
.demo-bar-footer-row {
  position: relative;
  z-index: 1;
  width: 100%;
  padding: var(--ds-space-sm) var(--ds-space-lg);
  border-top: 1px solid var(--gh-border);
  background: var(--gh-bg-secondary);
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ds-space-md);
}

.demo-bar-footer-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

.demo-bar-footer-right {
  flex-shrink: 0;
}

.demo-bar-footer-row .demo-bar-failed-msg {
  font-size: 12px;
  color: #f85149;
  margin: 0;
}

.demo-bar-round-nav {
  height: 40px;
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 2px;
}

.demo-bar-round-nav::-webkit-scrollbar {
  height: 2px;
}

.demo-bar-round-nav::-webkit-scrollbar-thumb {
  background: var(--gh-border);
}

.demo-bar-round-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1px;
  padding: 0 2px;
}

.demo-bar-round-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.demo-bar-round-btn {
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  color: var(--gh-text);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  transition: background 0.15s ease;
  position: relative;
}

.demo-bar-round-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.demo-bar-round-btn.is-filtered-out,
.demo-bar-round-btn:disabled.is-filtered-out {
  opacity: 0.4;
  color: var(--gh-text-muted);
  cursor: not-allowed;
  pointer-events: none;
}
.demo-bar-round-btn.is-filtered-out .demo-bar-round-icon {
  opacity: 0.6;
}

.demo-bar-round-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
  display: block;
}

.demo-bar-round-num {
  font-size: 10px;
  line-height: 1;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.demo-bar-round-underline {
  width: 100%;
  height: 2px;
  background: var(--gh-border);
}

.demo-bar-round-v-divider {
  width: 1px;
  height: 24px;
  border-left: 1px dashed var(--gh-border);
  margin: 0 var(--ds-space-xs);
  flex-shrink: 0;
}

/* === Filter Controls === */
.filter-controls {
  display: flex;
  gap: var(--ds-space-xl);
  align-items: center;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
}

.filter-group-label {
  font-size: 12px;
  color: var(--gh-text-muted);
  white-space: nowrap;
}

.filter-btn-economy.active.eco { background: rgba(63, 185, 80, 0.35); color: #3fb950; }
.filter-btn-economy.active.half { background: rgba(210, 153, 34, 0.35); color: #d29922; }
.filter-btn-economy.active.full { background: rgba(248, 81, 73, 0.35); color: #f85149; }
.filter-btn-economy.active.pistol { background: rgba(255, 255, 255, 0.2); color: #fff; }

.filter-label {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-secondary);
  white-space: nowrap;
}

.filter-dropdown-wrapper {
  position: relative;
}

.filter-tags-input {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  width: 200px;
  min-height: 36px;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
  position: relative;
}

/* Selected state - green background */
.filter-tags-input.has-selection {
  background: rgba(var(--ds-primary-rgb), 0.15);
  border-color: var(--ds-border-strong);
}

.filter-tags-input.has-selection:hover {
  background: rgba(var(--ds-primary-rgb), 0.2);
  border-color: var(--ds-border-strong);
}

/* Hide scrollbar but keep functionality */
.filter-tags-input::-webkit-scrollbar {
  height: 0;
  display: none;
}

.filter-tags-input {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.filter-tags-input:hover {
  border-color: var(--ds-border-strong);
}

.filter-tags-input:focus-within {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(var(--ds-primary-rgb), 0.12);
}

/* Selection text display */
.filter-selection-text {
  flex: 1;
  color: var(--ds-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Filter icon on the right */
.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ds-text-tertiary);
  transition: all var(--ds-transition-base);
  pointer-events: none;
}

.filter-tags-input.has-selection .filter-icon {
  color: var(--ds-primary);
  cursor: pointer;
  pointer-events: auto;
}

.filter-icon:hover {
  color: var(--ds-text-primary);
}

.filter-tags {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  flex-shrink: 0;
}

.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: rgba(var(--ds-primary-rgb), 0.15);
  border: 1px solid rgba(var(--ds-primary-rgb), 0.3);
  border-radius: var(--ds-radius-sm);
  color: var(--ds-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}

.filter-tag-remove {
  padding: 0;
  margin: 0;
  width: 16px;
  height: 16px;
  background: transparent;
  border: none;
  border-radius: 50%;
  color: var(--ds-primary);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--ds-transition-base);
}

.filter-tag-remove:hover {
  background: rgba(var(--ds-primary-rgb), 0.25);
  color: var(--ds-text-primary);
}

.filter-tags-input-field {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
}

.filter-tags-input-field::placeholder {
  color: var(--ds-text-tertiary);
  font-weight: 400;
}

.filter-input {
  padding: var(--ds-space-xs) var(--ds-space-md);
  padding-right: 36px; /* Make room for clear button */
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  min-width: 200px;
  height: 36px;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

.filter-clear-btn-tags {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--ds-transition-base);
  z-index: 1;
}

.filter-clear-btn-tags:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-clear-btn-tags:active {
  transform: translateY(-50%) scale(0.9);
}

.filter-input:focus {
  outline: none;
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(var(--ds-primary-rgb), 0.12);
}

.filter-input::placeholder {
  color: var(--ds-text-tertiary);
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-width: 260px;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
  animation: slideDown 0.15s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.filter-dropdown-item {
  padding: var(--ds-space-sm) var(--ds-space-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border-bottom: 1px solid var(--ds-border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
}

.dropdown-checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--ds-transition-base);
}

.filter-dropdown-item:hover .dropdown-checkbox {
  border-color: var(--ds-primary);
}

.filter-dropdown-item.selected .dropdown-checkbox {
  background: var(--ds-primary);
  border-color: var(--ds-primary);
}

.dropdown-checkbox svg {
  stroke: var(--ds-primary-text);
}

.filter-dropdown-item:last-child {
  border-bottom: none;
}

.filter-dropdown-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-dropdown-item.selected {
  background: rgba(var(--ds-primary-rgb), 0.1);
  color: var(--ds-primary);
  font-weight: 600;
}

.filter-dropdown-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.filter-dropdown-item.disabled .dropdown-checkbox {
  border-color: var(--ds-border-subtle);
  background: var(--ds-surface-base);
}

.dropdown-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item-count {
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  margin-left: auto;
  padding-left: var(--ds-space-sm);
}

.filter-dropdown-item:hover .dropdown-item-count {
  color: var(--ds-text-secondary);
}

.filter-dropdown-item.selected .dropdown-item-count {
  color: var(--ds-primary);
  opacity: 0.8;
}

.filter-buttons {
  display: flex;
  gap: var(--ds-space-xs);
  background: var(--ds-surface-base);
  padding: 3px;
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-border-subtle);
  height: 36px;
  box-sizing: border-box;
}

.filter-btn {
  padding: 4px var(--ds-space-md);
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  white-space: nowrap;
  height: 100%;
  display: flex;
  align-items: center;
}

.filter-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-btn.active {
  background: var(--ds-primary);
  color: var(--ds-primary-text);
  box-shadow: 0 2px 8px rgba(var(--ds-primary-rgb), 0.3);
}

.library-actions {
  display: flex;
  gap: var(--ds-space-md);
  align-items: center;
}

.library-actions .ds-btn {
  padding: var(--ds-space-sm) var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  height: 38px;
}

.library-actions .ds-btn-primary {
  background: #238636;
  color: #fff;
  border-color: #238636;
}

.library-actions .ds-btn-primary:hover:not(:disabled) {
  background: #2ea043;
  border-color: #2ea043;
  color: #fff;
}

.library-actions .ds-btn-primary:active:not(:disabled) {
  background: #26a641;
  border-color: #26a641;
  color: #fff;
}

.library-actions .ds-btn svg {
  width: 16px;
  height: 16px;
}

/* === Storage Quota Button Styles === */
.quota-btn-container {
  position: relative;
}

.quota-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.quota-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--ds-primary);
  color: var(--ds-primary);
  transform: translateY(-1px);
}

.quota-btn svg {
  width: 20px;
  height: 20px;
}

/* Quota Tooltip */
.quota-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  background: rgba(20, 20, 30, 0.98);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-lg);
  padding: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.2s ease;
  pointer-events: none;
  z-index: 1000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(10px);
}

.quota-btn-container:hover .quota-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.quota-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  right: 8px;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(20, 20, 30, 0.98);
}

/* Tooltip Sections */
.quota-tooltip-section {
  padding: 12px;
}

.quota-tooltip-section:not(:last-child) {
  border-bottom: 1px solid var(--ds-border-subtle);
}

.quota-tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  padding-bottom: 4px;
}

.quota-icon {
  flex-shrink: 0;
  color: var(--ds-text-primary);
  opacity: 0.9;
}

.quota-tooltip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ds-text-primary);
}

.quota-tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quota-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.quota-label {
  color: var(--ds-text-tertiary);
  font-weight: 500;
}

.quota-value {
  color: var(--ds-text-secondary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.quota-progress-bar {
  width: 100%;
  height: 6px;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
  border: 1px solid var(--ds-border-subtle);
  margin-top: 4px;
}

.quota-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ds-primary) 0%, var(--ds-secondary) 100%);
  transition: width 0.3s ease, background 0.3s ease;
  border-radius: var(--ds-radius-full);
  box-shadow: 0 0 8px rgba(var(--ds-primary-rgb), 0.3);
}

.quota-progress-fill.storage-warning {
  background: linear-gradient(90deg, #f59e0b 0%, #fb923c 100%);
  box-shadow: 0 0 8px rgba(251, 146, 60, 0.4);
}

.quota-progress-fill.storage-critical {
  background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
  animation: pulse-critical 2s ease-in-out infinite;
}

@keyframes pulse-critical {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.quota-percentage {
  font-size: 10px;
  font-weight: 700;
  color: var(--ds-text-tertiary);
  text-align: center;
  font-variant-numeric: tabular-nums;
  margin-top: 4px;
}

/* === Demo Grid Container === */
.demo-grid-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--ds-space-3xl) var(--ds-space-xl);
}

.demo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ds-space-lg);
  max-width: 100%;
  margin: 0 auto;
}

@media (max-width: 1400px) {
  .demo-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1000px) {
  .demo-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .demo-grid {
    grid-template-columns: 1fr;
  }
}

/* === Demo Card Styles === */
.demo-card {
  position: relative;
  height: 240px;
  border-radius: var(--ds-radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border: none;
  background: var(--ds-surface-base);
}

.demo-card:hover {
  transform: translateY(-6px);
  box-shadow: var(--ds-shadow-glow);
}

.demo-card.loading {
  pointer-events: none;
  opacity: 0.6;
}

.demo-card.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  border: 3px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: ds-spin 0.8s linear infinite;
  z-index: 10;
}

.demo-card.is-parsing {
  cursor: not-allowed;
  opacity: 0.95;
}

.demo-card.is-parsing:hover {
  transform: none;
  box-shadow: none;
}

.demo-card.is-failed {
  cursor: not-allowed;
  opacity: 0.95;
}

.demo-card.is-failed:hover {
  transform: none;
  box-shadow: none;
}

/* === Card Background === */
.card-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.card-background img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.25;
  filter: blur(1px) brightness(0.7);
  transition: all var(--ds-transition-base);
}

.demo-card:hover .card-background img {
  opacity: 0.35;
  filter: blur(0px) brightness(0.8);
  transform: scale(1.05);
}

.placeholder-bg {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--ds-bg-tertiary) 0%, var(--ds-bg-secondary) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 2px;
}

/* === Card Overlay === */
.card-overlay {
  position: relative;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: transparent;
  z-index: 1;
}

/* === Card Top (Map Name + Badge) === */
.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.map-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  max-width: 70%;
  overflow: hidden;
}

.map-badge svg {
  color: var(--ds-primary);
  flex-shrink: 0;
  width: 12px;
  height: 12px;
}

.map-badge span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.player-result-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  flex-shrink: 0;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.player-result-badge.win {
  background: rgba(16, 185, 129, 0.9);
  border: 1px solid rgba(16, 185, 129, 1);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.player-result-badge.loss {
  background: rgba(239, 68, 68, 0.9);
  border: 1px solid rgba(239, 68, 68, 1);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.player-result-badge.draw {
  background: rgba(107, 114, 128, 0.9);
  border: 1px solid rgba(107, 114, 128, 1);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

/* === Card Middle (Score Display) === */
.card-middle {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  min-height: 0;
}

.score-display {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid var(--ds-border-default);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.team-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.winner-section {
  align-items: flex-end;
}

.loser-section {
  align-items: flex-start;
}

.team-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 比分显示：唯一使用 GitHub 绿的位置 */
.winner-section .team-label {
  color: #3fb950;
}

.loser-section .team-label {
  color: var(--ds-text-tertiary);
}

.team-score {
  font-size: 32px;
  font-weight: 900;
  font-family: var(--ds-font-mono);
  line-height: 1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
}

.winner-score {
  color: #3fb950;
  text-shadow: 0 0 20px rgba(63, 185, 80, 0.4);
}

.loser-score {
  color: var(--ds-danger);
  opacity: 0.7;
}

.score-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0 4px;
}

.divider-line {
  width: 1px;
  height: 12px;
  background: var(--ds-border-default);
}

.vs-text {
  font-size: 9px;
  font-weight: 700;
  color: var(--ds-text-tertiary);
  letter-spacing: 0.5px;
  opacity: 0.6;
}

/* === Card Bottom (Meta Info) === */
.card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.meta-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--ds-text-tertiary);
  font-weight: 500;
  opacity: 0.8;
  min-width: 0;
}

.info-item svg {
  flex-shrink: 0;
  opacity: 0.6;
  width: 12px;
  height: 12px;
}

.info-item span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.card-delete-btn {
  padding: 6px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: var(--ds-danger);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  flex-shrink: 0;
}

.demo-card:hover .card-delete-btn {
  opacity: 1;
}

.card-delete-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: var(--ds-danger);
  transform: scale(1.15);
  box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
}

/* === Parsing Overlay === */
.parsing-overlay-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(26, 26, 46, 0.95); /* Match ConsoleModal transparency */
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.parsing-overlay-content {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-lg);
}

.parsing-file-name {
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  font-weight: 500;
  padding: var(--ds-space-xs) var(--ds-space-md);
  background: rgba(0, 0, 0, 0.3);
  border-radius: var(--ds-radius-md);
  border: 1px solid var(--ds-border-subtle);
  max-width: 90%;
  overflow: hidden;
}

.parsing-file-name svg {
  flex-shrink: 0;
  color: var(--ds-primary);
}

.parsing-file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parsing-progress-container {
  width: 80%;
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  align-items: center;
}

.parsing-progress-label {
  font-size: var(--ds-text-base);
  font-weight: 600;
  color: var(--ds-primary);
  margin-bottom: var(--ds-space-xs);
}

.parsing-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-full);
  overflow: hidden;
  border: 1px solid var(--ds-border-subtle);
}

.parsing-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--ds-primary) 0%, var(--ds-secondary) 50%, #60a5fa 100%);
  background-size: 200% 100%;
  transition: width 0.3s ease;
  animation: gradient-flow 2s ease-in-out infinite;
  border-radius: var(--ds-radius-full);
  box-shadow: 0 0 10px var(--ds-primary);
}

@keyframes gradient-flow {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.parsing-progress-text {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  font-variant-numeric: tabular-nums;
}

.parsing-status-tooltip {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  text-align: center;
  padding: var(--ds-space-xs) var(--ds-space-md);
  background: rgba(0, 0, 0, 0.5);
  border-radius: var(--ds-radius-sm);
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === Failed Overlay === */
.failed-overlay-card {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(26, 26, 46, 0.95); /* Match ConsoleModal transparency */
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ds-space-xl);
  z-index: 10;
}

.failed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-lg);
}

.failed-icon {
  animation: shake 0.5s ease-in-out;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-10px); }
  75% { transform: translateX(10px); }
}

.failed-label {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-danger);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.failed-message {
  font-size: var(--ds-text-base);
  font-weight: 500;
  color: var(--ds-text-secondary);
  text-align: center;
  line-height: 1.4;
  word-break: break-word;
  overflow-wrap: break-word;
  max-height: 4.2em;
  overflow-y: auto;
}

.delete-btn-failed {
  margin-top: var(--ds-space-xl);
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: var(--ds-danger);
  border: none;
  border-radius: var(--ds-radius-md);
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
}

.delete-btn-failed:hover {
  background: var(--ds-danger-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.delete-btn-parsing {
  position: absolute;
  bottom: var(--ds-space-lg);
  right: var(--ds-space-lg);
  padding: var(--ds-space-sm) var(--ds-space-md);
  background: rgba(239, 68, 68, 0.9);
  border: none;
  border-radius: var(--ds-radius-md);
  color: white;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-xs);
  font-size: 0.85rem;
  font-weight: 500;
  backdrop-filter: blur(4px);
  z-index: 10;
  opacity: 0;
}

.parsing-overlay-card:hover .delete-btn-parsing {
  opacity: 1;
}

.delete-btn-parsing:hover {
  background: var(--ds-danger);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

/* === Delete Modal === */
.delete-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7); /* Match ConsoleModal transparency */
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.delete-modal {
  max-width: 440px;
  padding: var(--ds-space-3xl);
  text-align: center;
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-icon {
  margin-bottom: var(--ds-space-xl);
  animation: pulse 2s ease-in-out infinite;
}

.modal-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-lg) 0;
}

.modal-message {
  font-size: var(--ds-text-base);
  color: var(--ds-text-secondary);
  margin: 0 0 var(--ds-space-sm) 0;
  line-height: 1.6;
}

.modal-message strong {
  color: var(--ds-primary);
}

.modal-message .filename-truncate {
  display: inline-block;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.modal-warning {
  font-size: var(--ds-text-sm);
  color: var(--ds-warning);
  margin: 0 0 var(--ds-space-xl) 0;
}

.modal-info {
  background: var(--ds-background-subtle);
  border-radius: var(--ds-radius-md);
  padding: var(--ds-space-md);
  margin: var(--ds-space-md) 0;
}

.modal-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ds-space-xs) 0;
}

.modal-info-row + .modal-info-row {
  border-top: 1px solid var(--ds-border-subtle);
  margin-top: var(--ds-space-xs);
  padding-top: var(--ds-space-sm);
}

.info-label {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  font-weight: 500;
}

.info-value {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-primary);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.info-value.filename-truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}

/* === Upload Demo Modal === */
.upload-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

.upload-modal {
  max-width: 520px;
  width: 90vw;
  padding: 0;
  animation: slideUp 0.3s ease;
  overflow: hidden;
  /* background: linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(22, 33, 62, 0.98) 100%); */
  backdrop-filter: blur(20px);
  border: 1px solid var(--ds-border-strong);
  position: relative;
}

.upload-modal-header {
  text-align: center;
  padding: var(--ds-space-3xl) var(--ds-space-3xl) var(--ds-space-xl);
  background: linear-gradient(180deg, rgba(var(--ds-primary-rgb), 0.08) 0%, transparent 100%);
  border-bottom: 1px solid var(--ds-border-subtle);
}

.upload-icon-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--ds-radius-xl);
  background: linear-gradient(135deg, rgba(var(--ds-primary-rgb), 0.15) 0%, rgba(var(--ds-primary-rgb), 0.05) 100%);
  border: 1px solid rgba(var(--ds-primary-rgb), 0.2);
  margin-bottom: var(--ds-space-lg);
}

.upload-icon {
  color: var(--ds-primary);
  filter: drop-shadow(0 2px 8px rgba(var(--ds-primary-rgb), 0.3));
}

.upload-modal-title {
  font-size: var(--ds-text-2xl);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0 0 var(--ds-space-xs);
  letter-spacing: -0.02em;
}

.upload-modal-subtitle {
  font-size: var(--ds-text-base);
  color: var(--ds-text-tertiary);
  margin: 0;
  font-weight: 400;
}

.upload-drop-zone {
  margin: var(--ds-space-3xl);
  border: 2px dashed var(--ds-border-default);
  border-radius: var(--ds-radius-xl);
  padding: var(--ds-space-3xl);
  cursor: pointer;
  background: rgba(var(--ds-primary-rgb), 0.06);
  position: relative;
  overflow: hidden;
  transition: all var(--ds-transition-base);
}

.upload-drop-zone::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(var(--ds-primary-rgb), 0.05) 0%, transparent 70%);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ds-transition-base);
}

.upload-drop-zone:hover {
  border-color: var(--ds-primary);
  background: rgba(var(--ds-primary-rgb), 0.12);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(var(--ds-primary-rgb), 0.15);
}

.upload-drop-zone:hover::before {
  opacity: 1;
}

.upload-drop-zone.is-dragover {
  border-color: var(--ds-primary);
  background: linear-gradient(135deg, rgba(var(--ds-primary-rgb), 0.15) 0%, rgba(var(--ds-primary-rgb), 0.08) 100%);
  border-style: solid;
  box-shadow: 0 0 0 4px rgba(var(--ds-primary-rgb), 0.1), 0 8px 24px rgba(var(--ds-primary-rgb), 0.2);
}

.upload-drop-zone.is-dragover::before {
  opacity: 1;
}

.upload-drop-zone:focus {
  outline: none;
}

.upload-drop-icon {
  margin-bottom: var(--ds-space-lg);
  color: var(--ds-primary);
  opacity: 0.85;
  transition: all var(--ds-transition-base);
}

.upload-drop-zone:hover .upload-drop-icon {
  opacity: 1;
  transform: translateY(-4px);
}

.upload-drop-text-primary {
  margin: 0 0 var(--ds-space-xs);
  font-size: var(--ds-text-lg);
  font-weight: 600;
  color: var(--ds-text-primary);
  line-height: 1.4;
}

.upload-drop-text-secondary {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  line-height: 1.4;
}

.upload-info-section {
  padding: 0 var(--ds-space-3xl) var(--ds-space-xl);
  text-align: left;
}

.upload-info-label {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin-bottom: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.upload-info-label svg {
  flex-shrink: 0;
}

.upload-info-text {
  margin: 0;
  padding: var(--ds-space-md) var(--ds-space-lg);
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.6;
  background: var(--ds-surface-base);
  border-radius: var(--ds-radius-md);
  border-left: 3px solid var(--ds-primary);
  word-break: break-word;
  font-family: "SFMono-Regular", "Consolas", "Liberation Mono", "Menlo", monospace;
}

.upload-warning-notice {
  margin: 0 var(--ds-space-3xl) var(--ds-space-xl);
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0.03) 100%);
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: var(--ds-radius-md);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  font-size: var(--ds-text-sm);
  color: var(--ds-warning);
  line-height: 1.5;
}

.upload-warning-notice svg {
  flex-shrink: 0;
  opacity: 0.9;
}

/* Close Button */
.upload-modal-close {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  width: 36px;
  height: 36px;
  border-radius: var(--ds-radius-full);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-default);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--ds-transition-base);
  z-index: 10;
}

.upload-modal-close:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-strong);
  color: var(--ds-text-primary);
  transform: rotate(90deg);
  box-shadow: 0 4px 12px rgba(var(--ds-primary-rgb), 0.2);
}

.upload-modal-close:focus {
  outline: 2px solid var(--ds-primary);
  outline-offset: 2px;
  background: var(--ds-surface-hover);
}
</style>
