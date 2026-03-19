<template>
  <div class="viewer-layout">
    <div class="viewer-main">
    <!-- Main Content: Map and Timeline -->
    <section class="map-panel">
      <!-- Cover：按优先级只显示一种 -->
      <div
        v-if="coverType !== 'none'"
        class="empty-state"
        :class="{
          'empty-state-not-found': coverType === 'not_found',
          'empty-state-forbidden': coverType === 'forbidden',
        }"
      >
        <!-- 1. 路由加载中 -->
        <div v-if="coverType === 'route_loading'" class="empty-state-content empty-state-route-loading">
          <div class="cover-spinner-container">
            <div class="cover-spinner"></div>
          </div>
          <p class="cover-status">正在加载回放…</p>
        </div>
        <!-- 2. 云端下载回合 -->
        <div v-else-if="coverType === 'cloud_download'" class="empty-state-content empty-state-cloud-download">
          <div class="empty-icon">↓</div>
          <h3>正在从云端下载回合</h3>
          <div class="empty-state-download-track">
            <div
              class="empty-state-download-bar"
              :class="{
                'is-determinate': cloudDownloadProgress?.lengthComputable === true,
                'is-indeterminate': cloudDownloadProgress?.lengthComputable === false,
              }"
              :style="downloadBarStyle"
            ></div>
          </div>
          <p class="empty-state-download-percent">
            {{ cloudDownloadProgress?.lengthComputable === true ? progress + '%' : '下载中…' }}
          </p>
        </div>
        <!-- 3. 未找到回放 -->
        <div v-else-if="coverType === 'not_found'" class="empty-state-content">
          <div class="empty-icon empty-icon-not-found" aria-hidden="true">
            <img src="/icons/notfound.svg" alt="" class="empty-icon-img" />
          </div>
          <h3>未找到回放</h3>
          <p>该回放不存在或尚未同步到本机</p>
        </div>
        <!-- 4. 回放无权限 -->
        <div v-else-if="coverType === 'forbidden'" class="empty-state-content">
          <div class="empty-icon empty-icon-forbidden" aria-hidden="true">
            <img src="/icons/unable.svg" alt="" class="empty-icon-img" />
          </div>
          <h3>回放无权限</h3>
          <p>你没有权限访问此笔记回合</p>
        </div>
        <!-- 5. 暂无回放数据（兜底） -->
        <div v-else class="empty-state-content">
          <div class="empty-icon empty-icon-no-selection" aria-hidden="true">
            <img src="/icons/wait.svg" alt="" class="empty-icon-img" />
          </div>
          <h3>暂无回放数据</h3>
          <p>请从 Demo 库选择文件</p>
        </div>
      </div>

      <!-- 地图画布 -->
      <div v-else class="map-canvas-wrapper">
        <MapCanvas 
          :frames="effectiveFrames" 
          :bounds="bounds"
          :current-frame-index="effectiveFrameIndex"
          :replay-meta="effectiveReplay"
          :is-playing="isPlaying"
          :is-dragging="isDraggingTimeline"
          :map-name="replay?.mapName"
          :projectile-configs="replay?.projectileRenderConfig"
          :is-drawing-mode="isDrawingMode"
          :pure-mode="pureMode"
          @close-drawing="isDrawingMode = false"
          @toggle-drawing="onToggleDrawing"
          :grenade-tracking-enabled="isGrenadeTrackingEnabled"
          @toggle-grenade-tracking="toggleGrenadeTracking"
          @projectile-click="handleProjectileClick"
          @toggle-pure-mode="togglePureMode"
          :tab-recorder-supported="tabRecorder.isSupported"
          :tab-recorder-recording="tabRecorder.isRecording.value"
          :tab-recorder-converting="tabRecorder.isConverting.value"
          :tab-recorder-converting-progress="tabRecorder.convertingProgress.value"
          :tab-recorder-pending="tabRecorder.pendingDownload.value"
          @tab-recorder-start="tabRecorder.startRecording"
          @tab-recorder-stop="tabRecorder.stopRecording"
          @tab-recorder-clear-pending="tabRecorder.clearPendingDownload"
          @tab-recorder-download="tabRecorder.downloadRecording"
          :replayer-source="replayerSource"
          :replayer-note-id="replayerNoteId"
          :hidden-player-ids="hiddenPlayerIdsArray"
          :show-map-projectiles="showMapProjectiles"
          :show-map-dropped="showMapDropped"
          :show-map-bomb="showMapBomb"
        />

        <!-- 投掷物分析蒙版 -->
        <GrenadeAnalyzeOverlay
          v-if="isGrenadeAnalyzeMode"
          :thrower-info="grenadeThrowerInfo"
          :selected-projectile="selectedProjectile"
          :throw-type="grenadeThrowType"
          :throw-moment-position="grenadeThrowMomentPosition"
          :button-states="grenadeButtonStates"
          :local-playback-time-ms="grenadeLocalPlaybackTimeMs"
          :analyze-time-range="analyzeTimeRange"
          :throw-frame-time-ms="throwFrameTimeMs"
          @close="handleGrenadeAnalyzeClose"
          @seek="handleGrenadeSeek"
        />

        <!-- 击杀回传 (Kill Feed) -->
        <div v-show="leftPanelTab === 'players'" class="kill-feed-container">
          <TransitionGroup name="list">
            <div v-for="k in currentRoundKills" :key="k.victimId" class="kill-feed-item">
              <div class="kill-card">
                <span class="k-killer" :class="getTeamClass(k.killerId)">{{ playerNameMap[k.killerId] || 'Unknown' }}</span>
                <div class="k-weapon-box">
                  <img :src="getWeaponIconPath(k.weaponId)" class="k-weapon-icon" @error="onWeaponIconError" />
                </div>
                <span class="k-victim" :class="getTeamClass(k.victimId)">{{ playerNameMap[k.victimId] || 'Unknown' }}</span>
              </div>
            </div>
          </TransitionGroup>
        </div>

        <!-- Left Panel: Tab (玩家/回合) + Player Cards or Round Selector + 剪辑/发布 -->
        <div v-if="coverType === 'none'" class="players-panel top-left">
          <div class="left-panel-header">
            <div class="left-panel-tabs">
              <button
                type="button"
                class="left-panel-tab"
                :class="{ active: leftPanelTab === 'players' }"
                @click="toggleLeftPanelTab('players')"
              >
                <span>玩家</span>
                <svg class="tab-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button
                type="button"
                class="left-panel-tab"
                :class="{ active: leftPanelTab === 'rounds' }"
                @click="toggleLeftPanelTab('rounds')"
              >
                <span>回合</span>
                <svg class="tab-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              <button
                type="button"
                class="left-panel-tab"
                :class="{ active: leftPanelTab === 'settings' }"
                @click="toggleLeftPanelTab('settings')"
              >
                <span>设置</span>
                <svg class="tab-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <!-- 无 tab 选中时占位，保持面板高度 -->
          <div v-show="leftPanelTab === null" class="left-panel-content left-panel-content-empty" aria-hidden="true"></div>
          <div v-show="leftPanelTab === 'players'" class="left-panel-content left-panel-players">
            <div class="left-panel-players-inner">
          <!-- First Half (1-12): T on top, Second Half (13+): CT on top. left-team-score-eye 控制上侧 -->
          <div class="upper-team-cards-slot" ref="upperTeamCardsRef">
          <div v-if="currentRound <= 12" class="team-cards-container t">
            <div v-for="p in teamTPlayers" :key="p.id" class="player-card-wrap" :data-player-id="p.id" :class="{ 'is-hidden': isPlayerHidden(p.id!) }">
              <div class="player-card-bottom t" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 't')">
              <!-- Column 1: Player Info -->
              <div class="card-col col-info">
                <div class="player-id">{{ p.name || 'UNKNOWN' }}</div>
                <div class="player-stats">
                  <div class="stat-item">
                    <img src="/icons/kill.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.kills || 0 }}</span>
                  </div>
                  <div class="stat-item">
                    <img src="/icons/death.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.deaths || 0 }}</span>
                  </div>
                </div>
                <div class="player-money">
                  <span class="money-symbol">$</span>
                  <span class="money-value">{{ (p.money || 0).toLocaleString() }}</span>
                </div>
              </div>
              
              <!-- Column 2: Equipment -->
              <div class="card-col col-equipment">
                <div class="active-weapon">
                  <img 
                    v-if="getPrimaryWeapon(p)"
                    :src="getWeaponIconPath(getPrimaryWeapon(p))" 
                    class="weapon-icon"
                    :class="{ 
                      'is-active': isWeaponActive(p, getPrimaryWeapon(p)),
                      'is-rifle': isRifleWeapon(getPrimaryWeapon(p))
                    }"
                    @error="onWeaponIconError"
                  />
                </div>
                <div class="utility-items">
                  <img 
                    v-for="(item, idx) in getUtilityItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="utility-icon"
                    :class="{ 'is-active': isWeaponActive(p, item) }"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
              
              <!-- Column 3: Status -->
              <div class="card-col col-status">
                <div class="health-display">
                  <div class="health-value">{{ Math.round(p.health || 0) }}</div>
                </div>
                <!-- <div class="armor-display">
                  <div class="armor-value">{{ Math.round(p.armor || 0) }}</div>
                </div> -->
                <div class="gear-items">
                  <img 
                    v-for="(item, idx) in getGearItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="gear-icon"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
            </div>
              <div class="player-card-hover-cover">
                <button type="button" class="player-card-action copy-pos" title="复制坐标" @click.stop="copyPlayerPosition(p)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button type="button" class="player-card-action toggle-vis" :class="{ active: isPlayerHidden(p.id!) }" :title="isPlayerHidden(p.id!) ? '显示该玩家' : '隐藏该玩家'" @click.stop="togglePlayerVisibility(p.id!)">
                  <svg v-if="!isPlayerHidden(p.id!)" class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
                <button v-if="isClipMode" type="button" class="player-card-action clip-delete" title="从拼接结果中移除该玩家" @click.stop="removePlayerFromClip(p.id!)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
              <div v-if="isPlayerHidden(p.id!)" class="player-card-hidden-cover" aria-hidden="true"></div>
            </div>
          </div>
          <div v-else class="team-cards-container ct">
            <div v-for="p in teamCTPlayers" :key="p.id" class="player-card-wrap" :data-player-id="p.id" :class="{ 'is-hidden': isPlayerHidden(p.id!) }">
              <div class="player-card-bottom ct" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 'ct')">
              <!-- Column 1: Player Info (first half CT) -->
              <div class="card-col col-info">
                <div class="player-id">{{ p.name || 'UNKNOWN' }}</div>
                <div class="player-stats">
                  <div class="stat-item">
                    <img src="/icons/kill.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.kills || 0 }}</span>
                  </div>
                  <div class="stat-item">
                    <img src="/icons/death.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.deaths || 0 }}</span>
                  </div>
                </div>
                <div class="player-money">
                  <span class="money-symbol">$</span>
                  <span class="money-value">{{ (p.money || 0).toLocaleString() }}</span>
                </div>
              </div>
              
              <!-- Column 2: Equipment -->
              <div class="card-col col-equipment">
                <div class="active-weapon">
                  <img 
                    v-if="getPrimaryWeapon(p)"
                    :src="getWeaponIconPath(getPrimaryWeapon(p))" 
                    class="weapon-icon"
                    :class="{ 
                      'is-active': isWeaponActive(p, getPrimaryWeapon(p)),
                      'is-rifle': isRifleWeapon(getPrimaryWeapon(p))
                    }"
                    @error="onWeaponIconError"
                  />
                </div>
                <div class="utility-items">
                  <img 
                    v-for="(item, idx) in getUtilityItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="utility-icon"
                    :class="{ 'is-active': isWeaponActive(p, item) }"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
              
              <!-- Column 3: Status -->
              <div class="card-col col-status">
                <div class="health-display">
                  <div class="health-value">{{ Math.round(p.health || 0) }}</div>
                </div>
                <!-- <div class="armor-display">
                  <div class="armor-value">{{ Math.round(p.armor || 0) }}</div>
                </div> -->
                <div class="gear-items">
                  <img 
                    v-for="(item, idx) in getGearItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="gear-icon"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
            </div>
              <div class="player-card-hover-cover">
                <button type="button" class="player-card-action copy-pos" title="复制坐标" @click.stop="copyPlayerPosition(p)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button type="button" class="player-card-action toggle-vis" :class="{ active: isPlayerHidden(p.id!) }" :title="isPlayerHidden(p.id!) ? '显示该玩家' : '隐藏该玩家'" @click.stop="togglePlayerVisibility(p.id!)">
                  <svg v-if="!isPlayerHidden(p.id!)" class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
                <button v-if="isClipMode" type="button" class="player-card-action clip-delete" title="从拼接结果中移除该玩家" @click.stop="removePlayerFromClip(p.id!)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
              <div v-if="isPlayerHidden(p.id!)" class="player-card-hidden-cover" aria-hidden="true"></div>
            </div>
          </div>
          </div>

          <!-- Score Display (Between Teams): 左=上方队伍 右=下方队伍，下半场用 isSecondHalf 判断显示颜色；hover 显示小眼睛一键隐藏/显示该队 -->
          <div class="score-divider">
            <div class="score-display">
              <div class="team-score-wrap left-team-score-wrap">
                <button
                  type="button"
                  class="team-score-eye left-team-score-eye"
                  :class="{ active: isLeftTeamHidden }"
                  :title="isLeftTeamHidden ? '显示上侧队伍' : '隐藏上侧队伍'"
                  @click.stop="toggleLeftTeamVisibility"
                >
                  <svg v-if="!isLeftTeamHidden" class="team-score-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="team-score-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
                <div class="team-score" :class="isSecondHalf(currentRound) ? 'ct-score' : 't-score'">
                  {{ currentScoreT }}
                </div>
              </div>
              <div class="score-separator">:</div>
              <div class="team-score-wrap right-team-score-wrap">
                <div class="team-score" :class="isSecondHalf(currentRound) ? 't-score' : 'ct-score'">
                  {{ currentScoreCT }}
                </div>
                <button
                  type="button"
                  class="team-score-eye right-team-score-eye"
                  :class="{ active: isRightTeamHidden }"
                  :title="isRightTeamHidden ? '显示下侧队伍' : '隐藏下侧队伍'"
                  @click.stop="toggleRightTeamVisibility"
                >
                  <svg v-if="!isRightTeamHidden" class="team-score-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="team-score-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Second Team (CT for rounds 1-12, T for rounds 13+). right-team-score-eye 控制下侧 -->
          <div class="lower-team-cards-slot" ref="lowerTeamCardsRef">
          <div v-if="currentRound <= 12" class="team-cards-container ct">
            <div v-for="p in teamCTPlayers" :key="p.id" class="player-card-wrap" :data-player-id="p.id" :class="{ 'is-hidden': isPlayerHidden(p.id!) }">
              <div class="player-card-bottom ct" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 'ct')">
              <div class="card-col col-info">
                <div class="player-id">{{ p.name || 'UNKNOWN' }}</div>
                <div class="player-stats">
                  <div class="stat-item">
                    <img src="/icons/kill.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.kills || 0 }}</span>
                  </div>
                  <div class="stat-item">
                    <img src="/icons/death.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.deaths || 0 }}</span>
                  </div>
                </div>
                <div class="player-money">
                  <span class="money-symbol">$</span>
                  <span class="money-value">{{ (p.money || 0).toLocaleString() }}</span>
                </div>
              </div>
              <div class="card-col col-equipment">
                <div class="active-weapon">
                  <img 
                    v-if="getPrimaryWeapon(p)"
                    :src="getWeaponIconPath(getPrimaryWeapon(p))" 
                    class="weapon-icon"
                    :class="{ 'is-active': isWeaponActive(p, getPrimaryWeapon(p)), 'is-rifle': isRifleWeapon(getPrimaryWeapon(p)) }"
                    @error="onWeaponIconError"
                  />
                </div>
                <div class="utility-items">
                  <img 
                    v-for="(item, idx) in getUtilityItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="utility-icon"
                    :class="{ 'is-active': isWeaponActive(p, item) }"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
              <div class="card-col col-status">
                <div class="health-display">
                  <div class="health-value">{{ Math.round(p.health || 0) }}</div>
                </div>
                <div class="gear-items">
                  <img 
                    v-for="(item, idx) in getGearItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="gear-icon"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
              </div>
              <div class="player-card-hover-cover">
                <button type="button" class="player-card-action copy-pos" title="复制坐标" @click.stop="copyPlayerPosition(p)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button type="button" class="player-card-action toggle-vis" :class="{ active: isPlayerHidden(p.id!) }" :title="isPlayerHidden(p.id!) ? '显示该玩家' : '隐藏该玩家'" @click.stop="togglePlayerVisibility(p.id!)">
                  <svg v-if="!isPlayerHidden(p.id!)" class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
                <button v-if="isClipMode" type="button" class="player-card-action clip-delete" title="从拼接结果中移除该玩家" @click.stop="removePlayerFromClip(p.id!)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
              <div v-if="isPlayerHidden(p.id!)" class="player-card-hidden-cover" aria-hidden="true"></div>
            </div>
          </div>
          <div v-else class="team-cards-container t">
            <div v-for="p in teamTPlayers" :key="p.id" class="player-card-wrap" :data-player-id="p.id" :class="{ 'is-hidden': isPlayerHidden(p.id!) }">
              <div class="player-card-bottom t" :class="{ 'is-dead': !p.alive }" :style="getCardBackgroundStyle(p, 't')">
              <!-- Column 1: Player Info -->
              <div class="card-col col-info">
                <div class="player-id">{{ p.name || 'UNKNOWN' }}</div>
                <div class="player-stats">
                  <div class="stat-item">
                    <img src="/icons/kill.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.kills || 0 }}</span>
                  </div>
                  <div class="stat-item">
                    <img src="/icons/death.svg" class="stat-icon" />
                    <span class="stat-value">{{ p.deaths || 0 }}</span>
                  </div>
                </div>
                <div class="player-money">
                  <span class="money-symbol">$</span>
                  <span class="money-value">{{ (p.money || 0).toLocaleString() }}</span>
                </div>
              </div>
              
              <!-- Column 2: Equipment -->
              <div class="card-col col-equipment">
                <div class="active-weapon">
                  <img 
                    v-if="getPrimaryWeapon(p)"
                    :src="getWeaponIconPath(getPrimaryWeapon(p))" 
                    class="weapon-icon"
                    :class="{ 
                      'is-active': isWeaponActive(p, getPrimaryWeapon(p)),
                      'is-rifle': isRifleWeapon(getPrimaryWeapon(p))
                    }"
                    @error="onWeaponIconError"
                  />
                </div>
                <div class="utility-items">
                  <img 
                    v-for="(item, idx) in getUtilityItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="utility-icon"
                    :class="{ 'is-active': isWeaponActive(p, item) }"
                    @error="onWeaponIconError"
                  />
                </div>
              </div>
              
              <!-- Column 3: Status -->
              <div class="card-col col-status">
                <div class="health-display">
                  <div class="health-value">{{ Math.round(p.health || 0) }}</div>
                </div>
                <!-- <div class="armor-display">
                  <div class="armor-value">{{ Math.round(p.armor || 0) }}</div>
                </div> -->
                <div class="gear-items">
                  <img 
                    v-for="(item, idx) in getGearItems(p)" 
                    :key="idx"
                    :src="getWeaponIconPath(item)" 
                    class="gear-icon"
                    @error="onWeaponIconError"
                  />
                </div>
            </div>
              <div class="player-card-hover-cover">
                <button type="button" class="player-card-action copy-pos" title="复制坐标" @click.stop="copyPlayerPosition(p)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button type="button" class="player-card-action toggle-vis" :class="{ active: isPlayerHidden(p.id!) }" :title="isPlayerHidden(p.id!) ? '显示该玩家' : '隐藏该玩家'" @click.stop="togglePlayerVisibility(p.id!)">
                  <svg v-if="!isPlayerHidden(p.id!)" class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  <svg v-else class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </button>
                <button v-if="isClipMode" type="button" class="player-card-action clip-delete" title="从拼接结果中移除该玩家" @click.stop="removePlayerFromClip(p.id!)">
                  <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
              <div v-if="isPlayerHidden(p.id!)" class="player-card-hidden-cover" aria-hidden="true"></div>
            </div>
          </div>
          </div>
          </div>
          </div>
          </div>
          <!-- Round selector (vertical, same position as player cards) - local only -->
          <div v-show="leftPanelTab === 'rounds'" class="left-panel-content left-panel-rounds">
            <div v-if="isClipMode" class="clip-mode-hint">已选 {{ clipRounds.length }} 个回合</div>
            <div class="left-panel-rounds-inner">
            <div class="round-selector-vertical">
              <template v-for="r in (replay?.totalRounds || 0)" :key="r">
                <button
                  type="button"
                  class="round-selector-row-btn"
                  :class="{
                    active: !isClipMode ? currentRound === r : clipRounds.some(c => c.round === r),
                    'clip-selected': isClipMode && clipRounds.some(c => c.round === r)
                  }"
                  :disabled="!!(replayerNoteId && r !== currentRound)"
                  @click="isClipMode ? toggleClipRound(r) : loadRoundData(r)"
                >
                  <span
                    class="round-economy-tag left"
                    :class="getRoundEconomyTypes(r, replay?.roundResults).left"
                  >{{ getRoundEconomyTypes(r, replay?.roundResults).left }}</span>
                  <div class="round-selector-center">
                    <img
                      v-if="getRoundResultIcon(r, replay?.roundResults) && shouldIconBeFirst(r, replay?.roundResults)"
                      :src="getRoundResultIcon(r, replay?.roundResults)!"
                      class="round-selector-icon"
                      :alt="getRoundResult(r, replay?.roundResults) || ''"
                    />
                    <span class="round-selector-num">{{ r }}</span>
                    <img
                      v-if="getRoundResultIcon(r, replay?.roundResults) && !shouldIconBeFirst(r, replay?.roundResults)"
                      :src="getRoundResultIcon(r, replay?.roundResults)!"
                      class="round-selector-icon"
                      :alt="getRoundResult(r, replay?.roundResults) || ''"
                    />
                  </div>
                  <span
                    class="round-economy-tag right"
                    :class="getRoundEconomyTypes(r, replay?.roundResults).right"
                  >{{ getRoundEconomyTypes(r, replay?.roundResults).right }}</span>
                </button>
                <div v-if="r === 12" class="round-selector-h-divider"></div>
              </template>
            </div>
            </div>
          </div>
          <!-- 设置 tab：地图上展示哪些元素，卡片布局与回合 tab 同宽 -->
          <div v-show="leftPanelTab === 'settings'" class="left-panel-content left-panel-settings">
            <div class="left-panel-settings-inner">
              <div class="settings-card">
                <div class="settings-card-title">地图显示</div>
                <label class="settings-option">
                  <input type="checkbox" v-model="showMapPlayers" />
                  <span>玩家</span>
                </label>
                <label class="settings-option">
                  <input type="checkbox" v-model="showMapProjectiles" />
                  <span>投掷物</span>
                </label>
                <label class="settings-option">
                  <input type="checkbox" v-model="showMapDropped" />
                  <span>掉落道具</span>
                </label>
                <label class="settings-option">
                  <input type="checkbox" v-model="showMapBomb" />
                  <span>C4</span>
                </label>
              </div>
            </div>
          </div>
          <div class="left-panel-footer">
            <div class="embed-link-wrap">
              <button
                v-if="!pureMode"
                type="button"
                class="left-panel-footer-btn embed-link-btn"
                title="复制内嵌分享链接"
                @click="copyEmbedLink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </button>
            </div>
            <button
              v-if="!pureMode"
              type="button"
              class="left-panel-footer-btn clip-mode-btn"
              :class="{ active: isClipMode }"
              title="导演剪辑：多选回合在一条时间线并行播放"
              @click="toggleClipMode"
            >
              <img src="/icons/slip.svg" class="left-panel-footer-btn-icon" alt="" />
            </button>
            <button
              v-if="!pureMode && isClipMode && effectiveReplay && effectiveFrames.length > 0"
              type="button"
              class="left-panel-footer-btn export-demo-btn"
              :class="{ 'converting': isExporting, 'export-success': exportSuccess }"
              :disabled="isExporting"
              @click="exportAsNewDemo"
            >
              <span v-if="isExporting" class="converting-progress-fill" :style="{ width: `${exportProgress}%` }"></span>
              <span class="converting-text">{{ exportButtonText }}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="timeline-panel">
      <!-- 道具解析模式下遮罩 timeline，禁止点击主时间轴 -->
      <div v-if="isGrenadeAnalyzeMode" class="timeline-block-mask" aria-hidden="true"></div>
      <div class="timeline-panel-inner">
      <TimelineControl
        :current-frame-index="effectiveFrameIndex"
        :total-frames="totalFrames"
        :is-playing="isPlaying"
        :current-time-ms="currentTimeMs"
        :total-time-ms="totalTimeMs"
        :playback-speed="playbackSpeed"
        :frames="safeFrames"
        :round-frames="currentRoundFrames"
        :round-start-time-ms="roundStartTimeMs"
        :round-duration-ms="roundDurationMs"
        :score-c-t="replay?.scoreCT || 0"
        :score-t="replay?.scoreT || 0"
        :replay-uuid="replay?.uuid"
        :total-rounds="replay?.totalRounds || 0"
        :round-results="replay?.roundResults || []"
        :replay-meta="replay"
        :pure-mode="pureMode"
        :cloud-replay="!!replayerNoteId || replayerDemoId != null"
        :can-play="effectiveFrames.length > 0"
        :hide-round-selector="true"
        :clip-mode="isClipMode"
        :clip-range-start="clipRangeStartIndex"
        :clip-range-end="clipRangeEndIndex"
        @update-clip-range="onClipRangeUpdate"
        @seek-seconds="onSeekSeconds"
        @toggle-play="togglePlay"
        @update-speed="onUpdateSpeed"
        @dragging-change="isDraggingTimeline = $event"
        @load-round="loadRoundData"
      />
      </div>
    </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue';
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import MapCanvas from './MapCanvas.vue';
import TimelineControl from './TimelineControl.vue';
import GrenadeAnalyzeOverlay from './GrenadeAnalyzeOverlay.vue';
import { useGetDisplayMediaRecorder } from '@/composables/useGetDisplayMediaRecorder';
import { useReplayData } from '@/composables/useReplayData';
import { useClipMerge } from '@/composables/useClipMerge';
import { useGrenadeAnalyzer } from '@/composables/useGrenadeAnalyzer';
import type { Frame, PlayerState, ReplayData, ReplayMeta, ProjectileState, ClipRoundConfig } from '@/types/replay';
import { EQUIPMENT_ID_MAP, isUtilityItem } from '@/config/equipment';
import { MATCH_CONFIG, getDisplayTeam, isSecondHalf } from '@/config/game';
import { getRoundResult, getRoundResultIcon, getRoundEconomyTypes, shouldIconBeFirst } from '@/config/eco';
import { replaceLocation, pathRef, searchRef, getQuery } from '@/location';
import { useAuth } from '@/composables/useAuth';
import { getReplayStorage } from '@/composables/indexdb-storage';
import { encodeReplayRound } from '@/composables/proto-converters';

const emit = defineEmits<{
  (e: 'clip-publish-available', payload: { available: boolean }): void;
}>();

// 初始化认证信息
const { currentUser } = useAuth();

// 纯净模式：隐藏左侧玩家卡、右侧击杀、timeline 回合选择器、侧边导航（由 App 通过 provide 控制）
const pureMode = ref(false);
// 左侧面板 Tab：玩家大卡 | 回合选择器（local）| 设置
const leftPanelTab = ref<'players' | 'rounds' | 'settings' | null>(null);

//切换左侧面板标签页（玩家/回合/设置）
function toggleLeftPanelTab(tab: 'players' | 'rounds' | 'settings') {
  leftPanelTab.value = leftPanelTab.value === tab ? null : tab;
}

//切换纯净模式（隐藏左侧面板）
function togglePureMode() {
  pureMode.value = !pureMode.value;
  // 在进入纯净模式时，关闭任何已打开的标签页
  if (pureMode.value) {
    leftPanelTab.value = null;
  }
}

//切换剪辑模式
function toggleClipMode() {
  isClipMode.value = !isClipMode.value;
  // 当启用剪辑模式时，自动切换到回合标签页
  if (isClipMode.value) {
    leftPanelTab.value = 'rounds';
  }
}
// 设置：地图上展示哪些元素（勾选=展示）。投掷/掉落/C4 为独立开关；玩家与卡片小眼睛共用 hiddenPlayerIds
const showMapProjectiles = ref(true);
const showMapDropped = ref(true);
const showMapBomb = ref(true);
// 导演剪辑模式：多选回合在一条时间线播放（仅 local）
const isClipMode = ref(false);
const clipRounds = ref<ClipRoundConfig[]>([]);
/** 剪辑 fork 为 round_0 进行中，发布按钮短暂禁用 */
const clipForking = ref(false);
/** 剪辑模式下点击垃圾桶移除的玩家 ID，从 frames 与 meta 中直接剔除 */
const clipDeletedPlayerIds = ref<Set<number>>(new Set());
/** 剪辑模式下时间范围选中：左/右拖柄对应的帧索引（闭区间 [start, end]） */
const clipRangeStartIndex = ref(0);
const clipRangeEndIndex = ref(0);

// 导出新 Demo 的状态变量
const isExporting = ref(false);
const exportProgress = ref(0);
const exportSuccess = ref(false);

// 导出按钮文本
const exportButtonText = computed(() => {
  if (exportSuccess.value) return '导出成功!';
  if (isExporting.value) return '正在导出...';
  return '导出为新 Demo';
});

//更新剪辑时间范围选中
function onClipRangeUpdate(payload: { start: number; end: number }) {
  clipRangeStartIndex.value = payload.start;
  clipRangeEndIndex.value = payload.end;
}
// 大卡上点击小眼睛隐藏的玩家 ID：不在地图绘制，大卡持续深色蒙层
const hiddenPlayerIds = ref<Set<number>>(new Set());
/** 进入道具解析前保存的隐藏状态，退出时恢复 */
const hiddenPlayerIdsBeforeAnalyze = ref<Set<number> | null>(null);
/** 设置里「玩家」取消勾选时保存的隐藏状态，勾选时恢复 */
const hiddenPlayerIdsBeforeSettingsHideAll = ref<number[] | null>(null);

//切换玩家可见性（隐藏/显示）
function togglePlayerVisibility(playerId: number) {
  const next = new Set(hiddenPlayerIds.value);
  if (next.has(playerId)) next.delete(playerId);
  else next.add(playerId);
  hiddenPlayerIds.value = next;
}

//检查玩家是否被隐藏
function isPlayerHidden(playerId: number) {
  return hiddenPlayerIds.value.has(playerId);
}

//从剪辑中移除玩家
function removePlayerFromClip(playerId: number) {
  const next = new Set(clipDeletedPlayerIds.value);
  next.add(playerId);
  clipDeletedPlayerIds.value = next;
}

//复制玩家坐标到剪贴板
async function copyPlayerPosition(p: PlayerState) {
  const x = (p.x ?? 0).toFixed(6);
  const y = (p.y ?? 0).toFixed(6);
  const z = (p.z ?? 0).toFixed(6);
  const pitch = (p.pitch ?? 0).toFixed(6);
  const yaw = (p.yaw ?? 0).toFixed(6);
  const cmd = `setpos ${x} ${y} ${z}; setang ${pitch} ${yaw} 0`;
  try {
    await navigator.clipboard.writeText(cmd);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '坐标已复制到剪贴板', type: 'info' } }));
  } catch {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '复制失败', type: 'error' } }));
  }
}

const hiddenPlayerIdsArray = computed(() => Array.from(hiddenPlayerIds.value));

//复制内嵌分享链接
async function copyEmbedLink() {
  let url = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const params = new URLSearchParams();
  // 追加参数
  if (replay.value?.uuid) {
    params.set('demo_uuid', replay.value.uuid);
  }
  if (currentRound.value !== undefined) {
    params.set('round', currentRound.value.toString());
  }
  params.set('pure', '1');
  // 返回完整 URL
  url = `${url}?${params.toString()}`;
  try {
    await navigator.clipboard.writeText(url);
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '已复制内嵌分享链接', type: 'info' } }));
  } catch {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: '复制失败', type: 'error' } }));
  }
}

const replayerPureMode = inject<Ref<boolean>>('replayerPureMode');
const replayerRouteLoading = inject<Ref<boolean>>('replayerRouteLoading', ref(false));
if (replayerPureMode) {
  watch(pureMode, (v) => { replayerPureMode.value = v; }, { immediate: true });
}

// 纯净模式 + 左侧 Tab 与 URL 同步：pure=1 / tab=players|rounds|settings
function syncReplayerUrl() {
  const q = getQuery();
  if (pureMode.value) {
    q.pure = '1';
  } else {
    delete q.pure;
    if (leftPanelTab.value != null) q.tab = leftPanelTab.value;
    else delete q.tab;
  }
  const search = new URLSearchParams(q).toString();
  replaceLocation(pathRef.value, search);
}
watch(pureMode, syncReplayerUrl);
watch(leftPanelTab, syncReplayerUrl);

// 打开链接时根据 URL 恢复 pure 与 tab
onMounted(() => {
  const q = getQuery();
  if (q.pure === '1' || q.pure === 'true') pureMode.value = true;
  if (q.tab === 'players' || q.tab === 'rounds' || q.tab === 'settings') {
    leftPanelTab.value = q.tab;
  } else {
    leftPanelTab.value = null;
  }
});

const { loading, error, replay, frames, bounds, loadRoundData: loadRoundDataFromDB, replayRouteError, cloudDownloadProgress, replayerSource, replayerNoteId, replayerDemoId } = useReplayData();

const { mergedFrames, mergedServerPlayer, loading: clipMergeLoading, error: clipMergeError } = useClipMerge(replay, clipRounds);

const effectiveFrames = computed<Frame[]>(() => {
  if (!isClipMode.value || clipRounds.value.length === 0 || mergedFrames.value.length === 0) {
    return frames.value ?? [];
  }
  const del = clipDeletedPlayerIds.value;
  if (del.size === 0) return mergedFrames.value;
  return mergedFrames.value.map((frame) => {
    const players: Record<number, NonNullable<Frame['players']>[number]> = {};
    if (frame.players) {
      for (const [idStr, p] of Object.entries(frame.players)) {
        const id = Number(idStr);
        if (!del.has(id)) players[id] = p;
      }
    }
    let killEvents = frame.killEvents;
    if (frame.killEvents && Object.keys(frame.killEvents).length > 0) {
      const filtered: Record<number, NonNullable<Frame['killEvents']>[number]> = {};
      for (const [vidStr, ev] of Object.entries(frame.killEvents)) {
        const vid = Number(vidStr);
        if (!del.has(vid) && !del.has(ev.killerId)) filtered[vid] = ev;
      }
      killEvents = Object.keys(filtered).length > 0 ? filtered : undefined;
    }
    let projectiles = frame.projectiles;
    if (frame.projectiles && Object.keys(frame.projectiles).length > 0) {
      const filtered: Record<number, ProjectileState> = {};
      for (const [eidStr, proj] of Object.entries(frame.projectiles)) {
        if (!del.has(proj.throwerID)) filtered[Number(eidStr)] = proj;
      }
      projectiles = Object.keys(filtered).length > 0 ? filtered : undefined;
    }
    let sortedProjs = frame.sortedProjs;
    if (projectiles && sortedProjs?.length) {
      const projSet = new Set(Object.keys(projectiles).map(Number));
      sortedProjs = sortedProjs.filter((eid) => projSet.has(eid));
    }
    return {
      ...frame,
      players: Object.keys(players).length > 0 ? players : ({} as Record<number, PlayerState>),
      killEvents,
      projectiles,
      sortedProjs: sortedProjs?.length ? sortedProjs : undefined,
    };
  });
});
const effectiveReplay = computed<ReplayData | null>(() => {
  const r = replay.value ?? null;
  if (isClipMode.value && clipRounds.value.length > 0 && mergedServerPlayer.value.length > 0 && r) {
    const del = clipDeletedPlayerIds.value;
    const serverPlayer =
      del.size > 0 ? mergedServerPlayer.value.filter((p) => !del.has(p.id)) : mergedServerPlayer.value;
    return { ...r, serverPlayer };
  }
  return r;
});

watch(
  [isClipMode, () => mergedFrames.value.length],
  () => {
    emit('clip-publish-available', { available: isClipMode.value && mergedFrames.value.length > 0 });
  },
  { immediate: true }
);

watch([isClipMode, clipRounds], () => {
  clipDeletedPlayerIds.value = new Set();
}, { deep: true });

watch([isClipMode, () => effectiveFrames.value.length], () => {
  if (!isClipMode.value || effectiveFrames.value.length === 0) return;
  const maxIdx = effectiveFrames.value.length - 1;
  clipRangeStartIndex.value = 0;
  clipRangeEndIndex.value = maxIdx;
}, { immediate: true });

// 播放笔记时应用 meta 中保存的 replaySettings（玩家可见性、地图投掷物/掉落/C4）
watch(
  [replayerNoteId, () => replay.value?.replaySettings],
  () => {
    if (!replayerNoteId.value) return;
    const s = replay.value?.replaySettings;
    if (!s) return;
    hiddenPlayerIds.value = new Set(s.hiddenPlayerIds ?? []);
    hiddenPlayerIdsBeforeSettingsHideAll.value = null;
    showMapProjectiles.value = s.showMapProjectiles ?? true;
    showMapDropped.value = s.showMapDropped ?? true;
    showMapBomb.value = s.showMapBomb ?? true;
  },
  { immediate: true }
);

const allPlayerIds = computed(() => effectiveReplay.value?.serverPlayer?.map((p) => p.id) ?? []);
/** 设置-玩家：与卡片小眼睛共用逻辑。取消勾选=全部隐藏，勾选=恢复之前状态 */
const showMapPlayers = computed({
  get: () => {
    const all = allPlayerIds.value;
    return all.length === 0 || !all.every((id) => hiddenPlayerIds.value.has(id));
  },
  set: (v: boolean) => {
    const all = allPlayerIds.value;
    if (all.length === 0) return;
    if (v) {
      const saved = hiddenPlayerIdsBeforeSettingsHideAll.value;
      if (saved != null) {
        hiddenPlayerIds.value = new Set(saved);
        hiddenPlayerIdsBeforeSettingsHideAll.value = null;
      } else {
        hiddenPlayerIds.value = new Set();
      }
    } else {
      hiddenPlayerIdsBeforeSettingsHideAll.value = Array.from(hiddenPlayerIds.value);
      hiddenPlayerIds.value = new Set(all);
    }
  },
});

/** 单一 cover 类型，按优先级只显示一种。云端下载中时优先展示进度条，不再被 route_loading 遮住。 */
type CoverType = 'route_loading' | 'cloud_download' | 'not_found' | 'forbidden' | 'no_data' | 'none';
const coverType = computed<CoverType>(() => {
  if (cloudDownloadProgress.value?.active) return 'cloud_download';
  if (replayerRouteLoading?.value) return 'route_loading';
  if (replayRouteError.value === 'not_found') return 'not_found';
  if (replayRouteError.value === 'forbidden') return 'forbidden';
  if (!replay.value || !effectiveFrames.value.length) return 'no_data';
  return 'none';
});

const progress = computed(() => cloudDownloadProgress.value?.progress ?? 0);
const downloadBarStyle = computed(() => {
  if (cloudDownloadProgress.value?.lengthComputable !== true) return {};
  const p = progress.value;
  return { width: `${p}%`, transform: 'none' };
});

// 投掷物分析功能
const grenadeAnalyzer = useGrenadeAnalyzer(frames, replay);
const {
  isTrackingEnabled: isGrenadeTrackingEnabled,
  isAnalyzeMode: isGrenadeAnalyzeMode,
  selectedProjectile,
  throwFrameIndex,
  analyzeTimeRange,
  localPlaybackTimeMs: grenadeLocalPlaybackTimeMs,
  currentAnalyzeFrameIndex,
  throwerInfo: grenadeThrowerInfo,
  buttonStates: grenadeButtonStates,
  throwType: grenadeThrowType,
  throwMomentPosition: grenadeThrowMomentPosition,
  toggleTracking: toggleGrenadeTracking,
  activateAnalyze: activateGrenadeAnalyze,
  exitAnalyze: exitGrenadeAnalyze,
  setLocalPlaybackTime: setGrenadeLocalPlaybackTime,
} = grenadeAnalyzer;

// 计算投掷帧的时间
const throwFrameTimeMs = computed(() => {
  if (throwFrameIndex.value === -1 || !frames.value) return 0;
  return frames.value[throwFrameIndex.value]?.timeMs || 0;
});

// 有效的帧索引：分析模式下使用分析帧，否则使用普通帧
const effectiveFrameIndex = computed(() => {
  if (isGrenadeAnalyzeMode.value && currentAnalyzeFrameIndex.value >= 0) {
    return currentAnalyzeFrameIndex.value;
  }
  return currentFrameIndex.value;
});

const currentFrameIndex = ref(0);
const currentPlaybackTimeMs = ref(0);
const isPlaying = ref(false);
const playbackSpeed = ref(1);
const isDraggingTimeline = ref(false);
const wasPlayingBeforeDrag = ref(false);

// Pre-built kill list for current round (optimized for display)
interface KillEventWithFrame {
  frameIndex: number;
  victimId: number;
  killerId: number;
  weaponId: number;
}
const roundKillList = ref<KillEventWithFrame[]>([]);
const isDrawingMode = ref(false);
const mapCanvasRef = ref<any>(null);

const tabRecorder = useGetDisplayMediaRecorder();

let lastTimestamp = 0;
let rafId: number | null = null;

// Animation control functions (declared early for use in watchers)
const startAnimation = () => {
  if (rafId != null) {
    return;
  }
  lastTimestamp = 0;
  rafId = requestAnimationFrame(stepPlayback);
};

const cancelAnimation = () => {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

// 处理投掷物点击事件：直接进入解析模式，无需先开「道具追踪」
const handleProjectileClick = (proj: ProjectileState) => {
  // 暂停主播放
  if (isPlaying.value) {
    isPlaying.value = false;
    cancelAnimation();
  }
  
  // 激活分析模式
  activateGrenadeAnalyze(proj);
};

// 处理分析模式的seek事件
const handleGrenadeSeek = (timeMs: number) => {
  setGrenadeLocalPlaybackTime(timeMs);
};

// 退出分析模式时，跳转到投掷帧
const handleGrenadeAnalyzeClose = () => {
  // 先记住投掷帧位置
  const targetFrame = throwFrameIndex.value;
  
  exitGrenadeAnalyze();
  
  // 跳转到投掷帧
  if (targetFrame !== -1 && frames.value) {
    currentFrameIndex.value = targetFrame;
    currentPlaybackTimeMs.value = frames.value[targetFrame]?.timeMs || 0;
  }
};

// 道具解析模式：进入时仅显示当前投掷人（其余用小眼睛逻辑 hide），退出时恢复先前隐藏状态
watch(isGrenadeAnalyzeMode, (isAnalyze) => {
  if (isAnalyze) {
    hiddenPlayerIdsBeforeAnalyze.value = new Set(hiddenPlayerIds.value);
    const throwerId = selectedProjectile.value?.throwerID;
    const allIds = effectiveReplay.value?.serverPlayer?.map((p) => p.id) ?? [];
    const toHide = throwerId != null ? allIds.filter((id) => id !== throwerId) : allIds;
    hiddenPlayerIds.value = new Set(toHide);
  } else {
    if (hiddenPlayerIdsBeforeAnalyze.value != null) {
      hiddenPlayerIds.value = hiddenPlayerIdsBeforeAnalyze.value;
      hiddenPlayerIdsBeforeAnalyze.value = null;
    }
  }
});

// Check URL for frameId parameter and seek to it
const checkUrlFrameId = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const frameId = urlParams.get('frameId');
  
  if (frameId) {
    const targetFrame = parseInt(frameId, 10);
    if (!isNaN(targetFrame) && targetFrame >= 0 && targetFrame < (frames.value?.length || 0)) {
      console.log(`[ReplayPlayer] URL contains frameId=${targetFrame}, seeking to frame`);
      currentFrameIndex.value = targetFrame;
      if (frames.value && frames.value[targetFrame]) {
        currentPlaybackTimeMs.value = frames.value[targetFrame].timeMs;
      }
    }
  };
};

// Build kill list from frames (called when round data is loaded)
const buildKillList = (framesArray: Frame[]) => {
  const killList: KillEventWithFrame[] = [];
  const seenVictims = new Set<number>();
  
  framesArray.forEach((frame, frameIndex) => {
    if (frame.killEvents) {
      for (const victimIdStr in frame.killEvents) {
        const victimId = parseInt(victimIdStr);
        if (!seenVictims.has(victimId)) {
          seenVictims.add(victimId);
          const killEvent = frame.killEvents[victimId];
          killList.push({
            frameIndex,
            victimId,
            killerId: killEvent.killerId,
            weaponId: typeof killEvent.weaponId === 'string' ? parseInt(killEvent.weaponId, 10) : killEvent.weaponId
          });
        }
      }
    }
  });
  
  roundKillList.value = killList;
  console.log(`[ReplayPlayer] Built kill list with ${killList.length} events`);
};



// 监听 replay 与有效帧（单回合 frames 或剪辑 mergedFrames）变化
watch(
  () => ({ replay: effectiveReplay.value, frames: effectiveFrames.value }),
  (data) => {
    console.log('[ReplayPlayer] 数据更新:', {
      hasReplay: !!data.replay,
      mapName: data.replay?.mapName,
      frameCount: data.frames?.length || 0
    });

    if (data.replay && data.frames && data.frames.length > 0) {
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = data.frames[0]?.timeMs ?? 0;
      buildKillList(data.frames);
      checkUrlFrameId();

      // 数据加载完成后自动开始播放
      nextTick(() => {
        isPlaying.value = false;
        cancelAnimation();
        togglePlay();
      });
      lastTimestamp = 0;
    }
  },
  { immediate: true }
);

// Auto-pause when dragging starts, auto-resume when dragging ends
watch(isDraggingTimeline, (isDragging) => {
  if (isDragging) {
    // Started dragging - pause if playing
    wasPlayingBeforeDrag.value = isPlaying.value;
    if (isPlaying.value) {
      isPlaying.value = false;
      cancelAnimation();
    }
  } else {
    // Stopped dragging - resume if was playing before
    if (wasPlayingBeforeDrag.value) {
      isPlaying.value = true;
      startAnimation();
      wasPlayingBeforeDrag.value = false;
    }
  }
});

const safeFrames = computed<Frame[]>(() => effectiveFrames.value || []);

const totalFrames = computed(() => safeFrames.value.length);

const currentFrame = computed<Frame | null>(() => {
  if (!safeFrames.value.length) return null;
  return safeFrames.value[currentFrameIndex.value] ?? null;
});

const teamCTPlayers = computed<PlayerState[]>(() => {
  const frame = currentFrame.value;
  if (!frame?.players || !effectiveReplay.value?.serverPlayer) return [];
  
  const result: PlayerState[] = [];
  for (const playerInfo of effectiveReplay.value.serverPlayer) {
    const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
    if (displayTeam !== 3) continue; // Display as CT only
    
    const frameData = frame.players[playerInfo.id];
    if (!frameData) continue; // Skip if player not in this frame
    
    // Merge metadata with frame data; name 与 hover 小卡一致：优先当前帧原生 name，再 fallback serverPlayer.name
    result.push({
      ...frameData,
      id: playerInfo.id,
      name: frameData.name ?? playerInfo.name,
      team: displayTeam, // Use display team
      steamID: playerInfo.steamID,
      isBot: playerInfo.isBot
    });
  }
  return result;
});

const teamTPlayers = computed<PlayerState[]>(() => {
  const frame = currentFrame.value;
  if (!frame?.players || !effectiveReplay.value?.serverPlayer) return [];
  
  const result: PlayerState[] = [];
  for (const playerInfo of effectiveReplay.value.serverPlayer) {
    const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
    if (displayTeam !== 2) continue; // Display as T only
    
    const frameData = frame.players[playerInfo.id];
    if (!frameData) continue; // Skip if player not in this frame
    
    // Merge metadata with frame data; name 与 hover 小卡一致：优先当前帧原生 name，再 fallback serverPlayer.name
    result.push({
      ...frameData,
      id: playerInfo.id,
      name: frameData.name ?? playerInfo.name,
      team: displayTeam, // Use display team
      steamID: playerInfo.steamID,
      isBot: playerInfo.isBot
    });
  }
  return result;
});

// 从 team-cards-container 的 DOM 遍历得到玩家 ID（left=上侧容器，right=下侧容器）
const upperTeamCardsRef = ref<HTMLElement | null>(null);
const lowerTeamCardsRef = ref<HTMLElement | null>(null);
function getPlayerIdsFromContainer(containerEl: HTMLElement | null): number[] {
  if (!containerEl) return [];
  const inner = containerEl.querySelector('.team-cards-container');
  if (!inner) return [];
  return Array.from(inner.querySelectorAll<HTMLElement>('.player-card-wrap[data-player-id]'))
    .map((el) => Number(el.getAttribute('data-player-id')))
    .filter((n) => !Number.isNaN(n));
}

// 计算所有玩家 ID 到名称的映射，用于击杀信息显示（剪辑模式下为合并后的 serverPlayer）
const playerNameMap = computed(() => {
  const map: Record<number, string> = {};
  if (effectiveReplay.value?.serverPlayer) {
    for (const playerInfo of effectiveReplay.value.serverPlayer) {
      map[playerInfo.id] = playerInfo.name;
    }
  }
  return map;
});

// --- 新增：当前回合数据计算 ---
const currentRound = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[currentFrameIndex.value]?.round || 0;
});

// 上下侧容器内的玩家 ID 由 DOM 实时决定（剪辑模式下合并后玩家更多，需随容器内元素更新）
const leftTeamIdsRef = ref<number[]>([]);
const rightTeamIdsRef = ref<number[]>([]);
function syncTeamIdsFromDom() {
  leftTeamIdsRef.value = getPlayerIdsFromContainer(upperTeamCardsRef.value);
  rightTeamIdsRef.value = getPlayerIdsFromContainer(lowerTeamCardsRef.value);
}
watch(
  [
    () => effectiveFrameIndex.value,
    () => safeFrames.value.length,
    () => effectiveReplay.value?.serverPlayer?.length ?? 0,
    () => isClipMode.value,
  ],
  () => {
    nextTick(syncTeamIdsFromDom);
  },
  { immediate: true }
);
const isLeftTeamHidden = computed(() => leftTeamIdsRef.value.length > 0 && leftTeamIdsRef.value.every((id) => hiddenPlayerIds.value.has(id)));
const isRightTeamHidden = computed(() => rightTeamIdsRef.value.length > 0 && rightTeamIdsRef.value.every((id) => hiddenPlayerIds.value.has(id)));
function toggleLeftTeamVisibility() {
  const ids = getPlayerIdsFromContainer(upperTeamCardsRef.value);
  const allHidden = ids.length > 0 && ids.every((id) => hiddenPlayerIds.value.has(id));
  const next = new Set(hiddenPlayerIds.value);
  if (allHidden) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  hiddenPlayerIds.value = next;
  syncTeamIdsFromDom();
}
function toggleRightTeamVisibility() {
  const ids = getPlayerIdsFromContainer(lowerTeamCardsRef.value);
  const allHidden = ids.length > 0 && ids.every((id) => hiddenPlayerIds.value.has(id));
  const next = new Set(hiddenPlayerIds.value);
  if (allHidden) ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  hiddenPlayerIds.value = next;
  syncTeamIdsFromDom();
}

// 计算实时比分（基于 roundResults，区分上下半场换边）
// roundResults 存的是「地图方」胜负：ct_win/bomb_defused=CT方赢，t_win/bomb_exploded=T方赢
// 上半场(1–12)：原T队在T方、原CT队在CT方；下半场(13+)换边，原T队在CT方、原CT队在T方
const currentScoreT = computed(() => {
  if (!replay.value?.roundResults || currentRound.value === 0) return 0;
  let score = 0;
  const secondHalfStart = MATCH_CONFIG.SECOND_HALF_START_ROUND;
  for (const result of replay.value.roundResults) {
    if (result.round >= currentRound.value) break;
    const isSecond = result.round >= secondHalfStart;
    // 原T队：上半场T方赢=加，下半场CT方赢=加
    if (isSecond) {
      if (result.result === 'ct_win' || result.result === 'bomb_defused') score++;
    } else {
      if (result.result === 't_win' || result.result === 'bomb_exploded') score++;
    }
  }
  return score;
});

const currentScoreCT = computed(() => {
  if (!replay.value?.roundResults || currentRound.value === 0) return 0;
  let score = 0;
  const secondHalfStart = MATCH_CONFIG.SECOND_HALF_START_ROUND;
  for (const result of replay.value.roundResults) {
    if (result.round >= currentRound.value) break;
    const isSecond = result.round >= secondHalfStart;
    // 原CT队：上半场CT方赢=加，下半场T方赢=加
    if (isSecond) {
      if (result.result === 't_win' || result.result === 'bomb_exploded') score++;
    } else {
      if (result.result === 'ct_win' || result.result === 'bomb_defused') score++;
    }
  }
  return score;
});

const currentRoundFrames = computed(() => {
  if (!safeFrames.value.length || currentRound.value === 0) return [];
  return safeFrames.value.filter(f => f.round === currentRound.value);
});

// 计算当前回合按时间顺序排列的击杀列表（最多显示 100 个，先进先出）
// 优化版本：使用预构建的 roundKillList，只需比较 frameIndex
const currentRoundKills = computed(() => {
  const currentIdx = currentFrameIndex.value;
  
  // 过滤出 frameIndex <= currentFrameIndex 的击杀事件
  const visibleKills = roundKillList.value.filter(kill => kill.frameIndex <= currentIdx);
  
  // 限制最多显示 100 个击杀事件（FIFO 队列：保留最新的 100 个）
  const MAX_KILL_FEED_SIZE = 100;
  if (visibleKills.length > MAX_KILL_FEED_SIZE) {
    return visibleKills.slice(-MAX_KILL_FEED_SIZE);
  }
  
  return visibleKills;
});

// 获取玩家阵营对应的 CSS 类（后半场翻转）
const getTeamClass = (playerId: number) => {
  if (effectiveReplay.value?.serverPlayer) {
    const playerInfo = effectiveReplay.value.serverPlayer.find(p => p.id === playerId);
    if (playerInfo) {
      // Get display team (flipped in second half)
      const displayTeam = getDisplayTeam(playerInfo.team, currentRound.value);
      return displayTeam === 3 ? 'ct' : 't';
    }
  }
  return '';
};

const roundStartTimeMs = computed(() => {
  if (!currentRoundFrames.value.length) return 0;
  return currentRoundFrames.value[0].timeMs;
});

const roundDurationMs = computed(() => {
  if (!currentRoundFrames.value.length) return 0;
  const lastFrame = currentRoundFrames.value[currentRoundFrames.value.length - 1];
  return lastFrame.timeMs - roundStartTimeMs.value;
});
// ----------------------------

const replayTitle = computed(() => replay.value?.mapName ?? '未知地图');

const currentTimeMs = computed(() => currentPlaybackTimeMs.value);

const totalTimeMs = computed(() => {
  if (!safeFrames.value.length) return 0;
  return safeFrames.value[safeFrames.value.length - 1]?.timeMs ?? 0;
});


watch(currentPlaybackTimeMs, (newTime) => {
  const framesArr = safeFrames.value;
  if (!framesArr.length) return;

  // During dragging, use incremental frame selection for smoother transitions
  if (isDraggingTimeline.value) {
    const currentTime = framesArr[currentFrameIndex.value]?.timeMs ?? 0;
    const timeDiff = newTime - currentTime;
    
    // If time difference is small, search nearby frames instead of binary search
    if (Math.abs(timeDiff) < 5000) { // Within 5 seconds
      if (timeDiff > 0) {
        // Moving forward - search incrementally
        for (let i = currentFrameIndex.value; i < framesArr.length; i++) {
          if (framesArr[i].timeMs > newTime) {
            currentFrameIndex.value = Math.max(0, i - 1);
            return;
          }
        }
        currentFrameIndex.value = framesArr.length - 1;
        return;
      } else if (timeDiff < 0) {
        // Moving backward - search incrementally
        for (let i = currentFrameIndex.value; i >= 0; i--) {
          if (framesArr[i].timeMs <= newTime) {
            currentFrameIndex.value = i;
            return;
          }
        }
        currentFrameIndex.value = 0;
        return;
      }
    }
  }

  // Use binary search for normal playback or large jumps
  let low = 0;
  let high = framesArr.length - 1;
  let ans = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (framesArr[mid].timeMs <= newTime) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  currentFrameIndex.value = ans;
});

const stepPlayback = (timestamp: number) => {
  if (!isPlaying.value || !totalFrames.value) {
    if (isPlaying.value) {
      isPlaying.value = false;
    }
    return;
  }

  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const realDelta = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  currentPlaybackTimeMs.value += realDelta * playbackSpeed.value;


  if (currentPlaybackTimeMs.value >= totalTimeMs.value) {
    
    currentPlaybackTimeMs.value = totalTimeMs.value;
    isPlaying.value = false;
    cancelAnimation();
    return;
  }

  rafId = requestAnimationFrame(stepPlayback);
};

const togglePlay = () => {
  const arr = safeFrames.value;
  const hasFrames = arr && arr.length > 0;
  if (!hasFrames) {
    return;
  }

  // Defensive sync: ensure currentFrameIndex/currentPlaybackTimeMs are in sync with frames (含剪辑模式 merged 帧)
  const idx = currentFrameIndex.value;
  const frame = arr[idx];
  const expectedTimeMs = frame?.timeMs ?? 0;
  const outOfBounds = idx < 0 || idx >= arr.length;
  const timeMismatch = Math.abs(currentPlaybackTimeMs.value - expectedTimeMs) > 100;
  if (outOfBounds || timeMismatch) {
    const clampedIdx = Math.max(0, Math.min(arr.length - 1, idx));
    currentFrameIndex.value = clampedIdx;
    currentPlaybackTimeMs.value = arr[clampedIdx]?.timeMs ?? 0;
    lastTimestamp = 0; // reset RAF timing for clean playback start
  }

  // If we are in drawing mode, close it when playing
  if (isDrawingMode.value) {
    isDrawingMode.value = false;
  }

  isPlaying.value = !isPlaying.value;
  if (isPlaying.value) {
    startAnimation();
  } else {
    cancelAnimation();
  }
};

const onToggleDrawing = () => {
  isDrawingMode.value = !isDrawingMode.value;
  if (isDrawingMode.value && isPlaying.value) {
    // Pause when entering drawing mode
    isPlaying.value = false;
    cancelAnimation();
  }
};

const onSeek = (frameIndex: number) => {
  const clamped = Math.max(0, Math.min(totalFrames.value - 1, frameIndex));
  currentFrameIndex.value = clamped;
  currentPlaybackTimeMs.value = safeFrames.value[clamped]?.timeMs ?? 0;
  lastTimestamp = 0;
};

const onSeekSeconds = (sec: number) => {
  currentPlaybackTimeMs.value = sec * 1000;
  lastTimestamp = 0;
};

const hpPercentage = (health: number | null | undefined) => {
  if (health == null || Number.isNaN(health)) return 0;
  return Math.max(0, Math.min(100, health));
};

// Get card background style with health-based progress bar
const getCardBackgroundStyle = (player: PlayerState, team: 'ct' | 't') => {
  if (!player.alive) return {}; // Dead players don't show progress
  
  const healthPercent = hpPercentage(player.health);
  
  // Team colors - more subtle, matching DemoLib style
  const colors = {
    ct: {
      start: 'rgba(59, 130, 246, 0.15)',   // Subtle blue
      end: 'rgba(59, 130, 246, 0.25)',
      dark: 'rgba(0, 0, 0, 0.7)'
    },
    t: {
      start: 'rgba(249, 115, 22, 0.15)',   // Subtle orange
      end: 'rgba(249, 115, 22, 0.25)',
      dark: 'rgba(0, 0, 0, 0.7)'
    }
  };
  
  const teamColors = colors[team];
  
  // Create gradient: team color for health portion, dark for remaining
  return {
    background: `linear-gradient(to right, 
      ${teamColors.start} 0%, 
      ${teamColors.end} ${healthPercent}%, 
      ${teamColors.dark} ${healthPercent}%, 
      ${teamColors.dark} 100%)`
  };
};

const getWeaponIconPath = (weaponId: any) => {
  if (weaponId === undefined || weaponId === null) return '/weapons/default.svg';
  
  // Handle special gear identifiers (not in EQUIPMENT_ID_MAP)
  if (typeof weaponId === 'string') {
    if (weaponId === 'defuser') return '/utility/defuser.svg';
    if (weaponId === 'armor_full') return '/utility/armor_full.svg';
    if (weaponId === 'armor') return '/utility/armor.svg';
  }
  
  const id = Number(weaponId);
  const fileName = EQUIPMENT_ID_MAP[id];
  
  if (!fileName) return '/weapons/default.svg';

  // Grenades and C4 are in utility folder, knife and all other weapons are in weapons folder
  const isUtilityFolder = (id >= 501 && id <= 506) || id === 404;
  const folder = isUtilityFolder ? 'utility' : 'weapons';
  return `/${folder}/${fileName}.svg`;
};

const onWeaponIconError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 如果加载失败，使用默认图标
  img.src = '/weapons/default.svg'; // 使用默认图标
};

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // 如果 logo 加载失败，隐藏图标
  img.style.display = 'none';
};

const onUpdateSpeed = (value: number) => {
  playbackSpeed.value = value;
};

const isGrenadeOrBomb = (weaponId: any) => {
  const id = Number(weaponId);
  return (id >= 501 && id <= 506) || id === 404;
};

const getPlayerUtility = (player: PlayerState) => {
  if (!player.inventory) return [];
  return player.inventory
    .filter(id => isGrenadeOrBomb(id))
    .sort((a, b) => Number(b) - Number(a)); // Sort by ID descending typically puts C4/Flash/Smoke in common orders
};

// Get all equipment for a player (weapons + utilities + knife)
const getAllEquipment = (player: PlayerState) => {
  if (!player.inventory) return [];
  return player.inventory; // Show all equipment including knife
};

// Check if equipment at index should be highlighted as active
// Only the first item matching activeWeapon will be highlighted
const isEquipmentActive = (player: PlayerState, item: string, idx: number): boolean => {
  if (!player.activeWeapon) return false;
  const activeId = Number(player.activeWeapon);
  const itemId = Number(item);
  
  if (activeId !== itemId) return false;
  
  // Find the first index of this equipment type in inventory
  const firstMatchIndex = player.inventory?.findIndex(invItem => Number(invItem) === activeId) ?? -1;
  return idx === firstMatchIndex;
};

// Get equipment name for tooltip
const getEquipmentName = (equipmentId: string): string => {
  const id = Number(equipmentId);
  const fileName = EQUIPMENT_ID_MAP[id];
  return fileName || 'Unknown';
};

// Helper functions for new card layout

// Get primary weapon (rifles, snipers, SMGs, pistols - prioritized)
const getPrimaryWeapon = (player: PlayerState): string | null => {
  if (!player.inventory) return null;
  
  // Priority order: Rifles/Snipers (300-399) > SMGs/Heavy (200-299 or legacy 100s) > Pistols (1-99)
  // Exclude: Knife (405), C4 (404), Grenades (501-506)
  
  // First try to find rifles/snipers (highest priority)
  const rifle = player.inventory.find(item => {
    const id = Number(item);
    return id >= 300 && id < 400;
  });
  if (rifle) return rifle;
  
  // Then try SMGs and heavy weapons (200-299 or legacy 100-199)
  const smg = player.inventory.find(item => {
    const id = Number(item);
    return (id >= 200 && id < 300) || (id >= 100 && id < 200);
  });
  if (smg) return smg;
  
  // Finally pistols (exclude knife 405)
  const pistol = player.inventory.find(item => {
    const id = Number(item);
    return id >= 1 && id < 100 && id !== 405;
  });
  if (pistol) return pistol;
  
  return null;
};

// Get utility items (grenades and C4)
const getUtilityItems = (player: PlayerState): string[] => {
  if (!player.inventory) return [];
  return player.inventory.filter(item => {
    const id = Number(item);
    return (id >= 501 && id <= 506) || id === 404;
  });
};

// Get gear items (armor, helmet, defuse kit)
const getGearItems = (player: PlayerState): string[] => {
  const items: string[] = [];
  if (!player) return items;
  
  // Note: These are not in inventory, they are separate properties
  // We'll show them as icons if the player has them
  if (player.hasDefuseKit) {
    items.push('defuser'); // Special identifier for defuse kit
  }
  
  // Armor display - distinguish between armor only and armor + helmet
  if (player.armor && player.armor > 0) {
    if (player.hasHelmet) {
      items.push('armor_full'); // Armor with helmet
    } else {
      items.push('armor'); // Armor only
    }
  }
  
  return items;
};

// Check if weapon is currently active
const isWeaponActive = (player: PlayerState, weaponId: string | null): boolean => {
  if (!weaponId || !player.activeWeapon) return false;
  return Number(player.activeWeapon) === Number(weaponId);
};

// Check if weapon is a rifle/sniper (needs scaling adjustment)
const isRifleWeapon = (weaponId: string | null): boolean => {
  if (!weaponId) return false;
  const id = Number(weaponId);
  // Rifles, snipers, SMGs need scaling (200-399 range)
  return (id >= 200 && id < 400) || (id >= 100 && id < 200);
};

// 导演剪辑：按选中顺序维护列表，最先选中的回合作为 baseRound
async function toggleClipRound(roundNumber: number) {
  const idx = clipRounds.value.findIndex((c) => c.round === roundNumber);
  if (idx >= 0) {
    // Removing a round from clip selection
    clipRounds.value = clipRounds.value.filter((_, i) => i !== idx);
  } else {
    // Adding a round to clip selection - first load the round data
    if (replay.value?.uuid) {
      console.log(`[ToggleClipRound] Loading round ${roundNumber} data for clip mode`);
      await loadRoundDataFromDB(replay.value.uuid, roundNumber);
    }
    clipRounds.value = [...clipRounds.value, { round: roundNumber }];
  }
}

// 获取当前用户 demo 数量
const getUserDemoCount = async (): Promise<number> => {
  if (!currentUser.value) return 0;
  
  try {
    const res = await fetch('/api/demos', { credentials: 'include' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.status === 'OK' && json?.data?.items) {
      return Array.isArray(json.data.items) ? json.data.items.length : 0;
    }
    return 0;
  } catch {
    return 0;
  }
};

// 导出剪辑后的 demo 为新 demo
async function exportAsNewDemo() {
  if (!effectiveReplay.value || effectiveFrames.value.length === 0) {
    console.warn('[ExportAsNewDemo] No effective replay data to export');
    return;
  }

  // 检查配额限制
  const demoCount = await getUserDemoCount();
  const quotaLimit = currentUser.value?.quota_limit ?? 0;
  
  if (demoCount >= quotaLimit) {
    window.dispatchEvent(new CustomEvent('app:toast', { 
      detail: { message: '当前 Demo 数量已到达用户上限', type: 'error' } 
    }));
    return;
  }

  isExporting.value = true;
  exportProgress.value = 0;
  exportSuccess.value = false;

  try {
    // 更新进度：开始导出
    exportProgress.value = 10;
    
    // 生成新的 UUID
    const newUuid = crypto.randomUUID();
    
    // 对于剪辑模式，使用选中时间范围的帧数据
    const clippedFrames = effectiveFrames.value.slice(
      clipRangeStartIndex.value,
      clipRangeEndIndex.value + 1 // slice is end-exclusive, so +1 to include end frame
    );
    
    // Build meta from ReplayMeta fields only (following clipForkForNote.ts pattern)
    const newReplayMeta: ReplayMeta = {
      uuid: newUuid,
      uploaderUid: effectiveReplay.value.uploaderUid ?? '',
      uploadTime: Date.now(),
      engineVersion: effectiveReplay.value.engineVersion,
      serverPlayer: effectiveReplay.value.serverPlayer,
      mapName: effectiveReplay.value.mapName ?? '',
      teamCT: effectiveReplay.value.teamCT ?? '',
      teamT: effectiveReplay.value.teamT ?? '',
      scoreCT: effectiveReplay.value.scoreCT ?? 0,
      scoreT: effectiveReplay.value.scoreT ?? 0,
      totalRounds: 1,
      roundResults: [
        {
          round: 1,
          result: 'ct_win',
          costT: 0,
          costCT: 0,
          countT: 0,
          countCT: 0,
        },
      ],
      totalFrames: clippedFrames.length,
      totalDurationMs:
        clippedFrames.length > 1
          ? (clippedFrames[clippedFrames.length - 1]?.timeMs ?? 0) - 
            (clippedFrames[0]?.timeMs ?? 0)
          : 0,
      status: 1,
      totalRawFrames: effectiveReplay.value.totalRawFrames,
      totalParsedFrames: effectiveReplay.value.totalParsedFrames,
      projectileRenderConfig: effectiveReplay.value.projectileRenderConfig,
      fileName: `${effectiveReplay.value.fileName || 'clipped'}_exported`,
      originPath: effectiveReplay.value.originPath,
      parsingProgress: effectiveReplay.value.parsingProgress,
      parsingStatus: effectiveReplay.value.parsingStatus,
      lastTickTime: effectiveReplay.value.lastTickTime,
      replaySettings: effectiveReplay.value.replaySettings,
    };
    
    // 更新进度：准备数据
    exportProgress.value = 30;
    
    // 创建回合数据（使用剪辑后的帧）
    const roundData = {
      uuid: newUuid,
      round: 1,
      frames: clippedFrames
    };
    
    // 将合并后的帧数据转换为字节数组 (这里使用 protobuf 编码)
    const encodedData = await encodeReplayRound(roundData);
    
    // 更新进度：编码完成
    exportProgress.value = 50;
    
    // 使用 IndexedDB 存储回合数据
    const storage = await getReplayStorage();
    await storage.saveRound(newUuid, 1, encodedData); // 保存为 round_1
    
    // 更新进度：本地存储完成
    exportProgress.value = 70;
    
    // 准备上传到云端的数据
    const formData = new FormData();
    formData.append('demo_uuid', newUuid);
    formData.append('meta', JSON.stringify(newReplayMeta));
    formData.append('permission', '0'); // 默认私有
    
    // 添加回合文件
    const blob = new Blob([encodedData], { type: 'application/octet-stream' });
    formData.append('round_1', blob, `round_1.pb.gz`);
    
    // 上传到云端 (with progress tracking)
    const uploadRes = await fetchWithProgress('/api/demos', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    }, (loaded, total) => {
      // 计算上传进度 (70% to 90% of total progress)
      const uploadPercentage = (loaded / total) * 20; // 20% of the total progress (from 70% to 90%)
      exportProgress.value = 70 + Math.floor(uploadPercentage);
    });
    
    const uploadJson = await uploadRes.json().catch(() => ({}));
    
    if (!uploadRes.ok || uploadJson?.status !== 'OK') {
      console.error('[ExportAsNewDemo] Upload failed:', uploadJson?.error || 'Unknown error');
      window.dispatchEvent(new CustomEvent('app:toast', { 
        detail: { message: '导出失败: ' + (uploadJson?.error || '未知错误'), type: 'error' } 
      }));
      return;
    }
    
    // 更新进度：完成
    exportProgress.value = 100;
    
    console.log('[ExportAsNewDemo] Successfully exported new demo with UUID:', newUuid);
    window.dispatchEvent(new CustomEvent('app:toast', { 
      detail: { message: '成功导出为新 Demo', type: 'info' } 
    }));
    
    // 标记成功并稍后重置状态
    exportSuccess.value = true;
    setTimeout(() => {
      isExporting.value = false;
      exportProgress.value = 0;
      setTimeout(() => {
        exportSuccess.value = false;
      }, 1000);
    }, 2000);
    
  } catch (error) {
    console.error('[ExportAsNewDemo] Error exporting demo:', error);
    window.dispatchEvent(new CustomEvent('app:toast', { 
      detail: { message: '导出失败: ' + (error as Error).message, type: 'error' } 
    }));
    isExporting.value = false;
    exportProgress.value = 0;
  }
}

// Fetch with progress tracking
async function fetchWithProgress(url: string, options: RequestInit, onProgress: (loaded: number, total: number) => void) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open(options.method || 'GET', url);
    
    // Copy headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        xhr.setRequestHeader(key, value as string);
      }
    }
    
    // Set credentials
    if (options.credentials === 'include') {
      xhr.withCredentials = true;
    }
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        // Create a Response-like object from xhr.response
        resolve(new Response(xhr.response, {
          status: xhr.status,
          statusText: xhr.statusText,
        }));
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };
    
    xhr.onerror = function() {
      reject(new Error('Network error'));
    };
    
    xhr.upload.onprogress = function(event) {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };
    
    // Type guard: XMLHttpRequest doesn't accept ReadableStream
    const body = options.body;
    if (body && typeof body === 'object' && 'getReader' in body) {
      reject(new Error('ReadableStream is not supported with XMLHttpRequest'));
      return;
    }
    xhr.send(body as XMLHttpRequestBodyInit | null | undefined);
  });
}

// Load specific round data from IndexedDB
const loadRoundData = async (roundNumber: number) => {
  if (!replay.value?.uuid) {
    console.warn('[LoadRoundData] No replay UUID available');
    return;
  }
  
  console.log(`[LoadRoundData] Loading round ${roundNumber} data`);
  
  // Pause playback during round switch
  const wasPlaying = isPlaying.value;
  if (wasPlaying) {
    isPlaying.value = false;
    cancelAnimation();
  }
  
  try {
    // Use the centralized loadRoundData from useReplayData
    await loadRoundDataFromDB(replay.value.uuid, roundNumber);
    
    // Reset to first frame of the loaded round
    currentFrameIndex.value = 0;
    currentPlaybackTimeMs.value = frames.value?.[0]?.timeMs || 0;
    
    console.log(`[LoadRoundData] Loaded round ${roundNumber} with ${frames.value?.length || 0} frames`);
    
    // 同步 URL：笔记模式保留 note_id/demo_id/round，否则 demo_uuid + round；并带上 tab 与 pure
    const q = getQuery();
    if (q.note_id) {
      q.round = String(roundNumber);
      if (q.demo_id != null) q.demo_id = String(q.demo_id);
    } else {
      delete q.source;
      delete q.uuid;
      q.demo_uuid = replay.value.uuid;
      q.round = String(roundNumber);
    }
    if (pureMode.value) { q.pure = '1'; } else { delete q.pure; if (leftPanelTab.value != null) q.tab = leftPanelTab.value; else delete q.tab; }
    replaceLocation('/replayer', new URLSearchParams(q).toString());
    
    // Resume playback if it was playing before
    if (wasPlaying) {
      isPlaying.value = true;
      startAnimation();
    }
  } catch (error) {
    console.error(`[LoadRoundData] Error loading round ${roundNumber}:`, error);
  }
};

watch(
  () => totalFrames.value,
  (count) => {
    if (!count) {
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
    } else {
      
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
    }
  },
);


watch(
  () => frames.value,
  (newFrames) => {
    if (newFrames && newFrames.length > 0) {

      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
      lastTimestamp = 0;
    }
  },
  { deep: true }
);

// 监听地图名称变化，强制更新组件
watch(
  () => replay.value?.mapName,
  (newMapName, oldMapName) => {
    if (newMapName && newMapName !== oldMapName) {
      console.log('[ReplayPlayer] 地图名称变化:', oldMapName, '->', newMapName);
      // 重置播放状态
      isPlaying.value = false;
      cancelAnimation();
      currentFrameIndex.value = 0;
      currentPlaybackTimeMs.value = 0;
      lastTimestamp = 0;
    }
  }
);

function onKeydown(e: KeyboardEvent) {
  if (e.code !== 'Space' && e.key !== ' ') return;
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
  e.preventDefault();
  togglePlay();
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  cancelAnimation();
});
</script>

<style scoped>
/* === Layout === */
.viewer-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  width: 100%;
  min-height: 0;
}

.viewer-layout.has-cloud-sidebar {
  flex-direction: row;
}

.viewer-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* === Map Panel === */
.map-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

/* === Player Panels (Bottom Corners) === */
.players-panel {
  position: absolute;
  z-index: var(--ds-z-dropdown);
  pointer-events: none;
}

.players-panel.top-left {
  top: var(--ds-space-lg);
  left: var(--ds-space-md);
  bottom: var(--ds-space-md);
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}

.left-panel-header {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.left-panel-tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--ds-radius-sm);
  flex-shrink: 0;
}

.left-panel-tab {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.left-panel-tab:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.left-panel-tab.active {
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
}

.left-panel-tab .tab-arrow {
  transition: transform 0.15s ease;
}

.left-panel-tab.active .tab-arrow {
  transform: rotate(180deg);
}

.left-panel-footer {
  pointer-events: auto;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 6px;
}

.left-panel-collapsed {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.left-panel-content {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  pointer-events: auto;
}

.left-panel-players {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  direction: rtl; /* 滚动条在左侧，与回合列表一致 */
}

.left-panel-players-inner {
  direction: ltr;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 玩家卡列表滚动条：与回合列表一致 */
.left-panel-players::-webkit-scrollbar {
  width: 8px;
}

.left-panel-players::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.left-panel-players::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

.left-panel-players::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.7);
}

.left-panel-rounds {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 10px;
  direction: rtl; /* 滚动条在左侧 */
}

.left-panel-rounds-inner {
  direction: ltr;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 回合列表滚动条：白色高亮 */
.left-panel-rounds::-webkit-scrollbar {
  width: 8px;
}

.left-panel-rounds::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.left-panel-rounds::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.5);
  border-radius: 4px;
}

.left-panel-rounds::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.7);
}



/* 设置 tab：与回合 tab 同宽、同滚动，内容用卡片展示 */
.left-panel-settings {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-top: 10px;
  direction: rtl;
}

.left-panel-settings-inner {
  direction: ltr;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 0;
}

.settings-card {
  background: var(--ds-bg-tertiary, #21262d);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--ds-radius-sm);
  padding: 12px 14px;
}

.settings-card-title {
  padding: 0 0 var(--ds-space-sm) 0;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--gh-text);
}

.settings-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  color: #f5f5f0;
  cursor: pointer;
}

.settings-option input[type="checkbox"] {
  margin: 0;
  flex-shrink: 0;
}

.round-selector-vertical {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  padding: 8px;
}

/* 单回合固定高度，不限制一页数量，超出滚动 */
.round-selector-row-btn {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0 12px;
  background: var(--ds-bg-tertiary, #21262d);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--ds-radius-sm);
  color: #f5f5f0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  pointer-events: auto;
}

.round-selector-row-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.round-selector-row-btn.active {
  background: rgba(var(--ds-primary-rgb, 88 166 255), 0.4);
  border-color: var(--ds-primary);
}

.round-selector-row-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.round-selector-row-btn.clip-selected {
  border-color: rgba(255, 200, 100, 0.6);
  background: rgba(255, 180, 80, 0.2);
}
/* 剪辑模式下选中态优先于 hover 展示 */
.round-selector-row-btn.clip-selected:hover:not(:disabled) {
  border-color: rgba(255, 200, 100, 0.6);
  background: rgba(255, 180, 80, 0.2);
}

.clip-mode-hint {
  padding: 6px 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.round-selector-center {
  flex: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.round-selector-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  flex-shrink: 0;
}

.round-selector-num {
  flex-shrink: 0;
  min-width: 1.5em;
}

/* 经济类型 tag：绿 eco、黄 half、红 full */
.round-economy-tag {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  text-transform: capitalize;
  padding: 1px 4px;
  border-radius: 3px;
}
.round-economy-tag.right {
  margin-left: auto;
}
.round-economy-tag.eco {
  background: rgba(63, 185, 80, 0.35);
  color: #3fb950;
}
.round-economy-tag.half {
  background: rgba(210, 153, 34, 0.35);
  color: #d29922;
}
.round-economy-tag.full {
  background: rgba(248, 81, 73, 0.35);
  color: #f85149;
}
.round-economy-tag.pistol {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.round-selector-h-divider {
  height: 1px;
  border-top: 1px dashed rgba(255, 255, 255, 0.3);
  margin: 4px 0;
}

.team-cards-container {
  display: flex;
  flex-direction: column;
  gap: 5px; /* 增大卡片间距 */
  padding: 4px;
  pointer-events: auto;
}

.player-card-wrap {
  position: relative;
  width: fit-content;
}

.player-card-hover-cover {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.player-card-wrap:hover .player-card-hover-cover {
  opacity: 1;
  pointer-events: auto;
}

.player-card-wrap.is-hidden .player-card-hover-cover {
  opacity: 1;
  pointer-events: auto;
}

.player-card-action {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.player-card-action:hover {
  background: rgba(255, 255, 255, 0.35);
}

.player-card-action .action-icon {
  width: 18px;
  height: 18px;
}

.player-card-action.toggle-vis.active {
  background: rgba(255, 180, 80, 0.4);
  color: #ffc870;
}

.player-card-hidden-cover {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  border-radius: var(--ds-radius-sm);
  pointer-events: none;
}

.score-divider {
  height: 42px; /* 降低高度 */
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 6px 4px; /* 减小边距 */
  position: relative;
}

.score-divider::before,
.score-divider::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0.15) 80%,
    transparent 100%
  );
}

.score-divider::before {
  top: 0;
}

.score-divider::after {
  bottom: 0;
}

.score-display {
  display: flex;
  align-items: center;
  gap: 10px; /* 略小间隙 */
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--ds-radius-sm);
  padding: 6px 14px; /* 减小内边距 */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
}

.team-score-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  position: relative;
  padding: 4px 6px;
  margin: -4px -6px;
  border-radius: var(--ds-radius-sm);
}
.team-score-wrap:hover .team-score-eye {
  opacity: 1;
}
.team-score-eye {
  opacity: 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.team-score-eye:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}
.team-score-eye.active {
  color: #ffc870;
}
.team-score-eye-icon {
  width: 14px;
  height: 14px;
}
.team-score {
  font-size: 24px; /* 略小字号 */
  font-weight: 800;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1;
  min-width: 28px; /* 略小宽度 */
  text-align: center;
}

.team-score.t-score {
  color: #fb923c; /* T team orange */
}

.team-score.ct-score {
  color: #60a5fa; /* CT team blue */
}

.score-separator {
  font-size: 20px; /* 略小字号 */
  font-weight: 300;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1;
}

.player-card-bottom {
  width: 280px;
  min-height: 60px; /* 调整高度为60 */
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(200, 200, 200, 0.25);
  border-radius: var(--ds-radius-sm);
  padding: 6px; /* 减小内边距给信息更多空间 */
  display: flex;
  gap: 6px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  position: relative;
  overflow: hidden;
}

.player-card-bottom.is-dead {
  opacity: 0.5;
  filter: grayscale(0.8);
}

/* Three Column Layout */
.card-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}

/* Column 1: Player Info (约35%) */
.col-info {
  flex: 1;
  min-width: 0;
}

/* Column 2: Equipment (约35%) */
.col-equipment {
  flex: 1;
  align-items: center;
}

/* Column 3: Status (约30%)：顶端对齐，health 顶齐无空隙（护甲已注释） */
.col-status {
  flex: 0.85;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 4px;
}

/* Column 1 Styles - Player Info */
.player-id {
  font-weight: 800;
  font-size: 12px; /* 放大 */
  color: #f5f5f0;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.3px;
}

.player-stats {
  display: flex;
  gap: 10px;
  align-items: center;
  line-height: 1;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.stat-icon {
  width: 12px;
  height: 12px;
  opacity: 0.9;
  flex-shrink: 0;
  filter: brightness(0) invert(1); /* 白色滤镜让SVG显示为白色 */
}

.stat-value {
  font-size: 12px; /* 放大 */
  font-weight: 600;
  color: #f5f5f0;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1;
}

.player-money {
  display: flex;
  align-items: baseline;
  gap: 2px;
  line-height: 1;
}

.money-symbol {
  font-size: 11px; /* 放大 */
  font-weight: 700;
  color: #22c55e;
  font-family: system-ui, -apple-system, sans-serif;
}

.money-value {
  font-size: 11px; /* 放大 */
  font-weight: 700;
  color: #22c55e;
  font-family: system-ui, -apple-system, sans-serif;
}

/* Column 2 Styles - Equipment */
.active-weapon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 2; /* 占用2/3高度 */
}

.weapon-icon {
  width: 40px;
  height: 20px;
  object-fit: contain;
  opacity: 0.85;
  filter: brightness(1.1);
  transition: all var(--ds-transition-base);
}

.weapon-icon.is-rifle {
  transform: scale(1.4); 
}

/* 激活状态只改变亮度，不改变大小 */
.weapon-icon.is-active {
  opacity: 1;
  transform: scale(1.2);
  filter: brightness(1.2) drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

.weapon-icon.is-rifle.is-active {
  opacity: 1;
  transform: scale(1.6);
  filter: brightness(1.2) drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
}

.utility-items {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  justify-content: center;
  flex: 1; /* 占用1/3高度 */
  align-items: flex-start;
  min-width: 92px; /* 5 个图标(16px) + 4 个间隙(3px) = 92px，保证一行能放下五个 */
}

.utility-icon {
  width: 16px; /* 略放大 */
  height: 16px;
  object-fit: contain;
  opacity: 0.75;
  filter: brightness(1.1);
  transition: all var(--ds-transition-base);
}

.utility-icon.is-active {
  opacity: 1;
  filter: brightness(1.3) drop-shadow(0 0 3px rgba(255, 255, 255, 0.4));
  transform: scale(1.1);
}

/* Column 3 Styles - Status */
.health-display {
  display: flex;
  justify-content: flex-end;
  align-items: flex-start;
  line-height: 1;
  margin: 0;
  padding: 0;
}

.health-value {
  font-size: 12px; /* 大字号 */
  font-weight: 800;
  color: #f5f5f0;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  min-width: 32px;
  text-align: right;
}

.armor-display {
  display: flex;
  justify-content: flex-end;
}

.armor-value {
  font-size: 12px; /* 放大 */
  font-weight: 700;
  color: #60a5fa;
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1;
  min-width: 32px;
  text-align: right;
}

.gear-items {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-height: 16px;
}

.gear-icon {
  width: 16px; /* 放大 */
  height: 16px;
  object-fit: contain;
  opacity: 0.8;
  filter: brightness(1.1);
  transition: all var(--ds-transition-base);
}

/* === 左侧 footer：内嵌链接、剪辑、发布 === */
.left-panel-footer .embed-link-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.left-panel-footer-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.left-panel-footer-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.4);
  color: white;
}
.left-panel-footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.left-panel-footer-btn-icon {
  width: 18px;
  height: 18px;
  display: block;
}
.left-panel-footer-btn-text {
  line-height: 1;
}
.clip-mode-btn.active {
  border-color: rgba(255, 200, 100, 0.6);
  background: rgba(255, 180, 80, 0.25);
  color: #ffc870;
}
.publish-note-btn.is-published {
  border-color: rgba(100, 200, 120, 0.5);
  background: rgba(80, 180, 100, 0.2);
  color: #7dd87d;
}
.publish-note-btn.is-published:hover:not(:disabled) {
  border-color: rgba(100, 200, 120, 0.6);
  background: rgba(80, 180, 100, 0.3);
  color: #9ee89e;
}

/* === Kill Feed === */
.kill-feed-container {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ds-space-xs);
  z-index: var(--ds-z-dropdown);
  pointer-events: none;
}

.kill-card {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid var(--ds-border-subtle);
  padding: var(--ds-space-xs) var(--ds-space-md);
  border-radius: var(--ds-radius-sm);
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  box-shadow: var(--ds-shadow-lg);
  white-space: nowrap;
}

.k-killer, .k-victim {
  font-weight: 700;
}

.k-killer.ct, .k-victim.ct, .k-assist.ct { color: #60a5fa; }
.k-killer.t, .k-victim.t, .k-assist.t { color: #fb923c; }

.k-assist {
  font-size: var(--ds-text-xs);
  display: flex;
  align-items: center;
  font-weight: 400;
}

.k-assist .plus {
  margin-right: 2px;
  color: var(--ds-text-muted);
  font-size: 9px;
}

.k-weapon-box {
  background: var(--ds-surface-base);
  padding: 2px var(--ds-space-xs);
  border-radius: 2px;
  display: flex;
  align-items: center;
}

.k-weapon-icon {
  width: 28px;
  height: 14px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

/* === Kill Feed Animation === */
.list-enter-active,
.list-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.list-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.list-leave-to {
  opacity: 0;
  transform: translateY(-30px); /* 向上消失 */
}

.list-leave-active {
  position: absolute; /* 让离开的元素脱离文档流，其他元素可以平滑上移 */
  width: 100%;
}

.list-move {
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); /* 平滑移动到新位置 */
}

/* === Map Canvas === */
.map-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-width: 0;
  width: 100%;
}

.map-canvas-wrapper {
  flex: 1;
  position: relative;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  background: #000000;
}

/* === Timeline（无回合选择器，固定紧凑高度） === */
.timeline-panel {
  position: relative;
  height: 50px;
  flex-shrink: 0;
  padding: 4px var(--ds-space-sm);
  border-top: 2px solid var(--ds-border-accent);
  background: var(--ds-bg-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.timeline-panel-inner {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 道具解析模式下仅遮罩 timeline，禁止点击 */
.timeline-block-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  pointer-events: auto;
}

/* === Empty State === */
.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-bg-secondary);
}

/* 未找到回放：偏中性灰 */
.empty-state.empty-state-not-found {
  background: linear-gradient(160deg, #2a2a2e 0%, #1c1c1f 100%);
}

.empty-state.empty-state-not-found .empty-state-content h3 {
  color: rgba(255, 255, 255, 0.85);
}

.empty-state.empty-state-not-found .empty-state-content p {
  color: rgba(255, 255, 255, 0.5);
}

/* 回放无权限：偏警示/冷色 */
.empty-state.empty-state-forbidden {
  background: linear-gradient(160deg, #2a2528 0%, #1f1a1c 50%, #1a1518 100%);
}

.empty-state.empty-state-forbidden .empty-state-content h3 {
  color: rgba(235, 180, 180, 0.95);
}

.empty-state.empty-state-forbidden .empty-state-content p {
  color: rgba(200, 160, 160, 0.6);
}

.empty-state-content {
  text-align: center;
  padding: var(--ds-space-3xl);
  max-width: 400px;
}

/* 路由加载中：转圈 + 文案（与原先 App 遮罩一致） */
.empty-state-content.empty-state-route-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-lg);
}
.cover-spinner-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--ds-space-2xl) 0;
}
.cover-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: cover-spin 0.8s linear infinite;
}
@keyframes cover-spin {
  to { transform: rotate(360deg); }
}
.cover-status {
  margin: 0;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-base);
}

/* 云端下载中：进度条 + 百分比 */
.empty-state-content.empty-state-cloud-download {
  min-width: 260px;
}
.empty-state-cloud-download .empty-icon {
  font-size: 48px;
  margin-bottom: var(--ds-space-md);
}
.empty-state-download-track {
  width: 100%;
  height: 8px;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  margin: var(--ds-space-md) 0 var(--ds-space-xs);
}
.empty-state-download-bar {
  display: block;
  height: 100%;
  width: 0;
  max-width: 100%;
  box-sizing: border-box;
  background: transparent;
  border-radius: 4px;
  transition: width 0.15s ease;
}
.empty-state-download-bar.is-determinate {
  background: var(--ds-primary);
}
.empty-state-download-bar.is-indeterminate {
  background: var(--ds-primary);
  width: 36% !important;
  animation: download-bar-indeterminate 1.4s ease-in-out infinite;
}
@keyframes download-bar-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
.empty-state-download-percent {
  font-variant-numeric: tabular-nums;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: var(--ds-space-xl);
  opacity: 0.6;
  animation: float 3s ease-in-out infinite;
}

.empty-icon-no-selection,
.empty-icon-not-found,
.empty-icon-forbidden {
  width: 80px;
  height: 80px;
  margin-left: auto;
  margin-right: auto;
  color: rgba(255, 255, 255, 0.7);
}

.empty-icon-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.empty-icon-not-found svg {
  width: 100%;
  height: 100%;
  display: block;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-state-content h3 {
  font-size: var(--ds-text-xl);
  font-weight: 600;
  color: var(--ds-text-secondary);
  margin-bottom: var(--ds-space-md);
}

.empty-state-content p {
  font-size: var(--ds-text-base);
  color: var(--ds-text-tertiary);
  line-height: 1.6;
}

/* === 最小 1024×768 适配 === */
@media (max-width: 1024px) {
  .players-panel.top-left {
    top: 8px;
    left: 6px;
  }

  .team-cards-container {
    gap: 3px;
    padding: 2px;
  }

  .player-card-bottom {
    width: 200px;
    min-height: 52px;
    padding: 4px;
    gap: 4px;
  }

  .player-id {
    font-size: 11px;
  }

  .stat-icon {
    width: 10px;
    height: 10px;
  }

  .stat-value,
  .health-value,
  .money-symbol,
  .money-value {
    font-size: 11px;
  }

  .weapon-icon {
    width: 32px;
    height: 16px;
  }

  .utility-icon,
  .gear-icon {
    width: 14px;
    height: 14px;
  }

  .utility-items {
    min-width: 72px;
  }

  .score-divider {
    height: 32px;
    margin: 4px 2px;
  }

  .team-score {
    font-size: 20px;
    min-width: 24px;
  }

  .score-separator {
    font-size: 16px;
  }

  .kill-feed-container {
    top: 8px;
    right: 8px;
    gap: 4px;
  }

  .kill-card {
    padding: 4px 10px;
    gap: 6px;
    font-size: 12px;
  }

  .k-weapon-icon {
    width: 22px;
    height: 12px;
  }
}

@media (max-height: 768px) {
  .timeline-panel {
    height: 41px;
    padding: 3px var(--ds-space-xs);
  }
}

/* ===移动端适配 === */
@media (max-width: 640px) {
  .timeline-panel {
    height: 100px; /* 两倍高度 */
    padding: 8px var(--ds-space-sm);
  }

  .players-panel.top-left {
    gap: 0;
  }

  .team-cards-container {
    gap: 2px;
    padding: 2px;
  }

  .player-card-bottom {
    min-height: 48px;
    padding: 3px;
    gap: 3px;
  }

  .player-id {
    font-size: 10px;
  }

  .stat-value,
  .health-value {
    font-size: 10px;
  }

  .weapon-icon {
    width: 28px;
    height: 14px;
  }

  .utility-icon,
  .gear-icon {
    width: 12px;
    height: 12px;
  }

  .score-divider {
    height: 28px;
    margin: 2px 2px;
  }

  .team-score {
    font-size: 18px;
  }
}

/* Export demo button with progress indicator (similar to tab recorder) */
.export-demo-btn {
  position: relative;
  overflow: hidden;
  min-width: 120px;
  justify-content: center;
  color: white;
  background: rgba(34, 197, 94, 0.8);
  text-decoration: none;
}

.export-demo-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 1);
}

.export-demo-btn.converting {
  position: relative;
}

.converting-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, rgba(100, 200, 120, 0.3), rgba(80, 180, 100, 0.5));
  transition: width 0.2s ease;
  z-index: 1;
}

.converting-text {
  position: relative;
  z-index: 2;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  min-width: 100px;
}

.export-demo-btn.export-success {
  border-color: rgba(100, 200, 120, 0.5);
  background: rgba(80, 180, 100, 0.2);
  color: #7dd87d;
}
</style>