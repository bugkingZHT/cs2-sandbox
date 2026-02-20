<template>
  <div class="app">
    <!-- Collapsible Sidebar（replayer 纯净模式下隐藏） -->
    <aside v-show="currentPage !== 'player' || !replayerPureMode" class="app-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- Sidebar Header -->
      <div class="sidebar-header">
        <div class="app-branding" v-show="!sidebarCollapsed">
          <img src="/logo/logo.png" alt="Snowbo" class="app-logo" @error="onLogoError" />
          <div class="app-title-group">
            <h1 class="app-title">Snowbo | 雪豹</h1>
            <p class="app-subtitle">CS2 Tac-Workshop</p>
          </div>
        </div>
        
        <!-- Collapse Toggle Button -->
        <button class="collapse-btn" @click="toggleSidebar" :title="sidebarCollapsed ? '展开' : '折叠'">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline :points="sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'"/>
          </svg>
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <button 
          class="nav-btn" 
          :class="{ active: currentPage === 'library' || (currentPage === 'player' && replayerSource === 'local') }"
          @click="onNavigateToDemolib"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">Demo 库</span>
          </span>
        </button>
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'notes' || (currentPage === 'player' && replayerSource === 'cloud') }"
          @click="onNavigateToNotes"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="5" y1="6" x2="5" y2="6"/>
            <line x1="10" y1="6" x2="19" y2="6"/>
            <line x1="5" y1="12" x2="5" y2="12"/>
            <line x1="10" y1="12" x2="19" y2="12"/>
            <line x1="5" y1="18" x2="5" y2="18"/>
            <line x1="10" y1="18" x2="19" y2="18"/>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">战术笔记</span>
          </span>
        </button>
      </nav>

      <!-- Spacer: 把下方 Beta / Console 顶到底部 -->
      <div class="sidebar-spacer" aria-hidden="true"></div>

      <!-- Beta Button -->
      <div v-if="DEBUG_CONFIG.enableBetaButton" class="sidebar-beta-section">
        <button 
          class="beta-btn"
          @click="showBetaWarning"
          :title="sidebarCollapsed ? '测试版' : ''"
        >
          <span class="beta-btn-text">BETA</span>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">测试版</span>
          </span>
        </button>
      </div>

      <div class="sidebar-footer">


        <button
          class="console-toggle-btn"
          :class="{ 'is-logged-in': currentUser }"
          @click="showConsoleModal = true"
        >
          <!-- 未登录：齿轮/设置风格；已登录：用户头像 -->
          <svg v-if="!currentUser" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span v-show="!sidebarCollapsed" class="nav-label">
            <span class="nav-text">{{ currentUser ? truncatedUsername : '系统 / 登录' }}</span>
            <span v-if="currentUser?.role === 'pro'" class="role-badge role-badge-pro">pro</span>
            <span v-else-if="currentUser?.role === 'pro+'" class="role-badge role-badge-proplus">pro+</span>
          </span>
        </button>
      </div>
    </aside>

    <!-- Library / Notes：header 浮于最上方（Teleport 目标），主内容在 app-main 内 -->
    <template v-if="currentPage === 'library' || currentPage === 'notes'">
      <div class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
        <header class="app-page-header" id="app-page-header"></header>
        <main class="app-main">
          <DemoLibrary
            v-if="currentPage === 'library'"
            :demo-list="replayList || []"
            :loading="loading"
            @select-demo="onSelectDemo"
            @delete-demo="onDeleteDemo"
            @upload-demo="onUploadDemo"
          />
          <NoteLibrary
            v-if="currentPage === 'notes'"
            :quota-used="quotaUsed"
            :quota-limit="quotaLimit"
            :replayer-source="replayerSource"
            :replayer-note-id="replayerNoteId"
            @share="openShareModal"
            @edit="onRequestEditNote"
            @delete="onRequestDeleteNote"
            @go="goToNoteItem"
          />
        </main>
      </div>
    </template>

    <!-- Player Page：与库页同布局，侧边栏 + 主区 -->
    <div v-else-if="currentPage === 'player'" class="app-main-area" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <header class="app-page-header" id="app-page-header"></header>
      <main class="app-main">
        <ReplayPlayer
          :can-add-to-note="canAddToNote"
          :note-uploading="noteUploading"
          :cloud-note="cloudNoteForReplayer"
          @save-current-round="handleAddToNote"
          @clip-publish-available="onClipPublishAvailable"
        />
      </main>
    </div>

    <!-- 解析进度弹窗（阻塞：先「等待解析器加载中」，再「解析中..」+ 进度条，解析完成后关闭） -->
    <div v-if="parsing" class="parsing-overlay">
      <div class="parsing-modal">
        <h3>{{ parsingProgress === 0 ? '等待解析器加载中' : '解析中..' }}</h3>
        <div class="spinner-container">
          <div class="spinner"></div>
        </div>
        <div class="parsing-progress-bar-wrap">
          <div class="parsing-progress-bar-fill" :style="{ width: parsingProgress + '%' }"></div>
        </div>
        <p class="parsing-status">{{ parsingStatus }}</p>
      </div>
    </div>

    <!-- Console Modal -->
    <ConsoleModal 
      :show-modal="showConsoleModal" 
      :current-page="currentPage"
      @close="showConsoleModal = false"
      @open-frame-data-viewer="handleFrameDataViewer"
      @open-storage-viewer="handleStorageViewer"
    />

    <!-- Beta Warning Modal -->
    <div v-if="showBetaModal" class="beta-modal-overlay" @click="showBetaModal = false">
      <div class="beta-modal" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h3 class="modal-title">测试版提醒</h3>
        <p class="modal-message">不保证功能稳定，数据可能随时被清理</p>
        <button class="ds-btn-primary" @click="showBetaModal = false">我知道了</button>
      </div>
    </div>

    <!-- 云存档提示（info/warning/error，样式见 styles/toast.css） -->
    <Transition name="toast-top">
      <div v-if="noteToast" :class="['ds-toast-top', 'ds-toast-' + noteToastType]">
        <span class="ds-toast-icon">
          <!-- info -->
          <svg v-if="noteToastType === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <!-- warning -->
          <svg v-else-if="noteToastType === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <!-- error -->
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </span>
        <span class="ds-toast-text">{{ noteToastMessage }}</span>
      </div>
    </Transition>

    <!-- 云存档删除确认 -->
    <div v-if="confirmDeleteNoteId !== null" class="beta-modal-overlay" @click="confirmDeleteNoteId = null">
      <div class="beta-modal" @click.stop>
        <div class="modal-icon error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4"/>
            <path d="M12 17h.01"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
        </div>
        <h3 class="modal-title">删除笔记</h3>
        <p class="modal-message">确定要删除此笔记吗？</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn-secondary" @click="confirmDeleteNoteId = null">取消</button>
          <button type="button" class="ds-btn-primary ds-btn-danger" @click="onConfirmDeleteNote">删除</button>
        </div>
      </div>
    </div>

    <!-- 云存档分享弹窗 -->
    <div
      v-if="shareModalNoteId !== null"
      class="beta-modal-overlay"
      @click="onCloseShareModal"
    >
      <div class="beta-modal" @click.stop>
        <button type="button" class="modal-close-btn" aria-label="关闭" @click="onCloseShareModal">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </div>
        <h3 class="modal-title">分享笔记</h3>
        <div class="modal-form">
          <div class="form-group">
            <div class="form-radios">
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="private" @change="saveShareModalPermission" />
                <span>仅自己可见</span>
              </label>
              <label class="form-radio">
                <input v-model="shareModalPermission" type="radio" value="public" @change="saveShareModalPermission" />
                <span>获得链接即可查看</span>
              </label>
            </div>
          </div>
        </div>
        <div class="share-link-row" @click="copyShareLinkInShareModal">
          <code class="share-link-url">{{ getShareUrlForNoteId(shareModalNoteId) }}</code>
          <span class="share-link-copy" :class="{ copied: shareModalCopyCopied }" title="复制链接">
            <svg v-if="!shareModalCopyCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
        </div>
      </div>
    </div>

    <!-- 云存储用量已达上限 -->
    <div v-if="showQuotaExceededModal" class="beta-modal-overlay" @click="showQuotaExceededModal = false">
      <div class="beta-modal" @click.stop>
        <h3 class="modal-title">战术笔记用量已达上限</h3>
        <p class="modal-message">战术笔记用量 {{ quotaUsed }}/{{ quotaLimit }}，无法继续上传。请升级或清理后再试。</p>
        <div class="modal-actions">
          <button type="button" class="ds-btn-primary" @click="showQuotaExceededModal = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 编辑笔记弹窗 -->
    <div
      v-if="editModalOpen"
      class="beta-modal-overlay"
      @click="closeEditModal()"
    >
      <div class="beta-modal beta-modal--note-form" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        </div>
        <h3 class="modal-title">编辑笔记</h3>
        
        <div class="form-group">
          <label class="form-label">标题</label>
          <input 
            type="text" 
            v-model="editFormTitle" 
            class="form-input" 
            placeholder="请输入笔记标题"
            maxlength="64"
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea 
            v-model="editFormContent" 
            class="form-textarea" 
            placeholder="请输入笔记内容"
            rows="6"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label class="form-label">可见性</label>
          <div class="radio-group">
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="editFormPermission" 
                value="private" 
                class="radio-input"
              />
              <span class="radio-label">仅自己可见</span>
            </label>
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="editFormPermission" 
                value="public" 
                class="radio-input"
              />
              <span class="radio-label">公开可见</span>
            </label>
          </div>
        </div>
        
        <!-- Demo Items Section -->
        <div v-if="editDemoItems.length > 0" class="demo-items-section">
          <h4 class="section-title">附件 ({{ editDemoItems.length }} 个)</h4>
          <div class="demo-items-list">
            <div 
              v-for="demo in editDemoItems" 
              :key="demo.id"
              class="demo-item-card"
              :class="{ 'marked-for-deletion': demo.markedForDeletion }"
            >
              <div class="demo-item-info">
                <div class="demo-meta-line">
                  <span class="demo-map-name">
                    <img src="/icons/map.svg" alt="" class="demo-icon" />
                    {{ getDemoMapName(demo) }}
                  </span>
                  <span class="demo-teams">
                    {{ getDemoTeamCT(demo) }} vs {{ getDemoTeamT(demo) }}
                  </span>
                  <span class="demo-time">{{ formatDemoTime(getDemoAddTime(demo)) }}</span>
                </div>
              </div>
              <button 
                type="button" 
                class="demo-delete-btn"
                :class="{ 'delete-marked': demo.markedForDeletion }"
                @click="toggleDemoDeletion(demo.id)"
                :title="demo.markedForDeletion ? '取消删除' : '标记删除'"
              >
                <svg v-if="!demo.markedForDeletion" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        <div class="modal-actions">
          <button type="button" class="ds-btn-secondary" @click="closeEditModal">取消</button>
          <button type="button" class="ds-btn-primary" @click="saveEditNote">保存</button>
        </div>
      </div>
    </div>

    <!-- 新建笔记弹窗 -->
    <div
      v-if="createNoteModalOpen"
      class="beta-modal-overlay"
      @click="closeCreateNoteModal()"
    >
      <div class="beta-modal beta-modal--note-form" @click.stop>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <h3 class="modal-title">新建笔记</h3>
        
        <div class="form-group">
          <label class="form-label">标题</label>
          <input 
            type="text" 
            v-model="createNoteFormTitle" 
            class="form-input" 
            placeholder="请输入笔记标题"
            maxlength="64"
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">内容</label>
          <textarea 
            v-model="createNoteFormContent" 
            class="form-textarea" 
            placeholder="请输入笔记内容"
            rows="6"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label class="form-label">可见性</label>
          <div class="radio-group">
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="createNoteFormPermission" 
                value="private" 
                class="radio-input"
              />
              <span class="radio-label">仅自己可见</span>
            </label>
            <label class="radio-option">
              <input 
                type="radio" 
                v-model="createNoteFormPermission" 
                value="public" 
                class="radio-input"
              />
              <span class="radio-label">公开可见</span>
            </label>
          </div>
        </div>
        
        <div class="modal-actions">
          <button type="button" class="ds-btn-secondary" @click="closeCreateNoteModal">取消</button>
          <button type="button" class="ds-btn-primary" @click="submitCreateNote">创建</button>
        </div>
      </div>
    </div>
    <div
      v-if="uploadModalOpen"
      class="beta-modal-overlay"
      @click="uploadModalStep !== 'uploading' && closeUploadModal()"
    >
      <div class="beta-modal" :class="{ 'beta-modal--note-form': uploadModalStep === 'form' }" @click.stop>
        <!-- 表单 -->
        <template v-if="uploadModalStep === 'form'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="modal-icon-svg">
              <line x1="5" y1="6" x2="5" y2="6"/><line x1="10" y1="6" x2="19" y2="6"/>
              <line x1="5" y1="12" x2="5" y2="12"/><line x1="10" y1="12" x2="19" y2="12"/>
              <line x1="5" y1="18" x2="5" y2="18"/><line x1="10" y1="18" x2="19" y2="18"/>
            </svg>
          </div>
          <h3 class="modal-title">{{ editingNoteId ? '修改笔记' : '发布笔记' }}</h3>
          
          <!-- Tab selection for new note vs existing note -->
          <div v-if="!editingNoteId" class="modal-tabs">
            <button 
              type="button" 
              class="modal-tab" 
              :class="{ active: uploadTab === 'new' }"
              @click="uploadTab = 'new'"
            >
              新建笔记
            </button>
            <button 
              type="button" 
              class="modal-tab" 
              :class="{ active: uploadTab === 'existing' }"
              @click="uploadTab = 'existing'"
            >
              归档到已有笔记
            </button>
          </div>
          <div class="modal-form">
            <!-- New note tab -->
            <template v-if="uploadTab === 'new'">
              <div class="form-group">
                <input
                  v-model="uploadFormTitle"
                  type="text"
                  class="form-input"
                  maxlength="64"
                  placeholder="笔记名称"
                />
              </div>
              <div class="form-group note-form-editor-wrap">
                <Editor v-model="uploadFormContent" />
              </div>
              <div class="form-group">
                <div class="form-radios">
                  <label class="form-radio">
                    <input v-model="uploadFormPermission" type="radio" value="private" />
                    <span>仅自己可见</span>
                  </label>
                  <label class="form-radio">
                    <input v-model="uploadFormPermission" type="radio" value="public" />
                    <span>公开链接</span>
                  </label>
                </div>
              </div>
            </template>
            
            <!-- Existing note tab -->
            <template v-else-if="uploadTab === 'existing'">
              <div class="form-group">
                <label class="form-label">选择要归档的笔记</label>
                <div class="filter-dropdown-wrapper">
                  <div
                    class="filter-tags-input"
                    :class="{ 'has-selection': selectedNoteId }"
                    @click="showNoteDropdown = true"
                  >
                    <span v-if="selectedNoteId && selectedNote" class="filter-selection-text">
                      {{ selectedNote.title || '无标题' }}
                    </span>
                    <span v-else class="filter-placeholder">请选择笔记</span>
                    <span class="filter-icon" @click.stop="handleNoteIconClick">
                      <svg v-if="selectedNoteId" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </span>
                  </div>
                  <div v-if="showNoteDropdown" class="filter-dropdown ds-scrollbar">
                    <div
                      v-for="note in noteList"
                      :key="note.id"
                      class="filter-dropdown-item"
                      :class="{ selected: selectedNoteId === note.id }"
                      @click="selectNote(note.id)"
                    >
                      <span class="dropdown-item-name">{{ note.title || '无标题' }}</span>
                      <span class="dropdown-item-count">({{ getNoteDemoCount(note) }})</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="form-info">
                <p>将当前回合归档到选中的笔记中，不会创建新的笔记条目</p>
              </div>
            </template>
          </div>
          <div class="modal-actions">
            <button type="button" class="ds-btn-secondary" @click="closeUploadModal">取消</button>
            <button type="button" class="ds-btn-primary" @click="submitUploadFromModal">
              {{ editingNoteId ? '保存修改' : (uploadTab === 'existing' ? '归档' : '发布') }}
            </button>
          </div>
        </template>
        <!-- 上传中 -->
        <template v-else-if="uploadModalStep === 'uploading'">
          <div class="modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">正在上传</h3>
          <div class="upload-progress">
            <div class="upload-progress-track">
              <div class="upload-progress-bar" :style="{ width: uploadProgress + '%' }"></div>
            </div>
            <span class="upload-progress-text">{{ uploadProgress }}%</span>
          </div>
        </template>
        <!-- 成功 -->
        <template v-else-if="uploadModalStep === 'success'">
          <div class="modal-icon success">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3 class="modal-title">上传成功</h3>
          <p class="modal-message success">已保存到战术笔记</p>
          <div class="share-link-row" v-if="createdNoteId" @click="copyShareLinkInShareModal">
            <code class="share-link-url">{{ getShareUrlForNoteId(createdNoteId) }}</code>
            <span class="share-link-copy" :class="{ copied: copyLinkCopied }" title="复制链接">
              <svg v-if="!copyLinkCopied" class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <svg v-else class="share-link-copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </span>
          </div>
          <div class="modal-actions">
            <button type="button" class="ds-btn-primary" @click="closeUploadModal">完成</button>
          </div>
        </template>
        <!-- 失败 -->
        <template v-else-if="uploadModalStep === 'error'">
          <div class="modal-icon error">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3 class="modal-title">上传失败</h3>
          <p class="modal-message error">{{ uploadError }}</p>
          <div class="modal-actions">
            <button type="button" class="ds-btn-primary" @click="closeUploadModal">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, provide, defineAsyncComponent } from 'vue';

const ReplayPlayer = defineAsyncComponent(() => import('@/components/ReplayPlayer/ReplayPlayer.vue'));
const DemoLibrary = defineAsyncComponent(() => import('@/components/DemoLibrary/DemoLibrary.vue'));
const NoteLibrary = defineAsyncComponent(() => import('@/components/NoteLibrary/NoteLibrary.vue'));
import Editor from '@/components/NoteLibrary/Editor.vue';
const ConsoleModal = defineAsyncComponent(() => import('@/components/Settings/PanelModal.vue'));
import { useReplayData } from '@/composables/useReplayData';
import { useNote, type CloudArchiveItem, type NoteToastType } from '@/composables/useNote';
import { useAuth } from '@/composables/useAuth';
import { resolveTeamDisplayName } from '@/composables/teamDisplay';
import { DEBUG_CONFIG } from '@/config/debug';
import { showReplayStorageDetails } from '@/composables/replayStorageViewer';
import { pathRef, searchRef, useLocation, navigate, replaceLocation, getQuery, saveReplayerReturnUrl } from '@/location';

const { 
  parsing, 
  parsingProgress,
  parsingStatus,
  replayList, 
  loading,
  parseDemo,
  loadReplayById,
  loadRoundData,
  loadReplayByLocal,
  loadReplayByCloud,
  deleteReplayById,
  clearCloudPlaybackState,
  replay,
  currentRoundNumber,
  waitForInitialLoad,
  replayRouteError,
  replayerSource,
  replayerNoteId,
  replayerDemoId,
  cloudNoteDetailFromApi,
} = useReplayData();

const SIDEBAR_COLLAPSED_KEY = 'snowbo-sidebar-collapsed';

useLocation();

const currentPage = computed<'library' | 'player' | 'notes'>(() => {
  const p = pathRef.value;
  if (p === '/replayer') return 'player';
  if (p === '/notes') return 'notes';
  return 'library'; // /demolib or /
});

const currentDemoId = ref<string | null>(null);
const sidebarCollapsed = ref(false);
const replayerPureMode = ref(false); // 播放器内「纯净模式」时隐藏侧边栏
provide('replayerPureMode', replayerPureMode);
const showConsoleModal = ref(false);
const replayerRouteLoading = ref(false);
provide('replayerRouteLoading', replayerRouteLoading);
const showBetaModal = ref(false);

const hasSelectedDemo = computed(() => !!currentDemoId.value);

const { currentUser, truncatedUsername, fetchAuthMe } = useAuth();

const {
  noteList,
  loadNotes,
  addItem: addNoteItem,
  removeItem: removeNoteItemById,
  setItems,
  updateItem: updateNoteItem,
  quotaUsed,
  quotaLimit,
  isQuotaFull,
  noteToast,
  noteToastMessage,
  noteToastType,
  showNoteToast,
  noteUploading,
  uploadModalOpen,
  uploadModalStep,
  uploadFormTitle,
  uploadFormContent,
  uploadFormPermission,
  uploadProgress,
  uploadError,
  createdNoteId,
  copyLinkCopied,
  uploadContext,
  openUploadModal,
  openEditModal,
  openEditNoteModal,
  closeUploadModal,
  closeEditModal,
  submitUploadFromModal,
  submitArchiveToExistingNote,
  saveEditNote,
  toggleDemoDeletion,
  confirmDeleteNoteId,
  confirmDeleteNoteConfirm,
  showQuotaExceededModal,
  shareModalOpen,
  shareModalNoteId,
  shareModalPermission,
  shareModalCopyCopied,
  getShareUrlForNoteId,
  openShareModal: openShareModalFromNote,
  closeShareModal,
  saveShareModalPermission,
  copyShareLinkInShareModal,
  editingNoteId,
  uploadTab,
  selectedNoteId,
  // Edit modal state
  editModalOpen,
  editNoteItem,
  editDemoItems,
  editFormTitle,
  editFormContent,
  editFormPermission,
  // Create note modal state
  createNoteModalOpen,
  createNoteFormTitle,
  createNoteFormContent,
  createNoteFormPermission,
  openCreateNoteModal,
  closeCreateNoteModal,
  submitCreateNote,
} = useNote();

const canPublishClip = ref(false);
function onClipPublishAvailable(payload: { available: boolean }) {
  canPublishClip.value = payload.available;
}
const canAddToNote = computed(
  () =>
    currentPage.value === 'player' &&
    replayerSource.value !== 'cloud' &&
    ((!!currentDemoId.value && !!currentRoundNumber.value && !!replay.value) || canPublishClip.value)
);

/** 当前播放的云笔记（source=cloud 时用于 ReplayPlayer 左侧「笔记」tab）。本人笔记用 noteList；公开笔记未登录或他人查看用 GET item 返回的 cloudNoteDetailFromApi */
const cloudNoteForReplayer = computed(() => {
  const id = replayerNoteId.value;
  if (!id) return null;
  const item = noteList.value.find((n) => n.id === id);
  if (item) return { title: item.title, content: item.content ?? '' };
  return cloudNoteDetailFromApi.value;
});

function openShareModal(item: CloudArchiveItem) {
  openNoteMenuId.value = null;
  openShareModalFromNote(item);
}

function onRequestEditNote(item: CloudArchiveItem) {
  openEditNoteModal(item);
  openNoteMenuId.value = null;
}

function onRequestDeleteNote(item: CloudArchiveItem) {
  confirmDeleteNoteId.value = item.id;
  openNoteMenuId.value = null;
}

function onCloseShareModal() {
  closeShareModal();
  openNoteMenuId.value = null;
}

async function onConfirmDeleteNote() {
  await confirmDeleteNoteConfirm();
  openNoteMenuId.value = null;
}

async function handleAddToNote(forkContext?: import('@/composables/useNote').UploadReplayContext) {
  if (!forkContext) return;
  if (!currentUser.value) {
    showNoteToast('需要登录账户', 'warning');
    return;
  }
  if (isQuotaFull.value) {
    showQuotaExceededModal.value = true;
    return;
  }
  openUploadModal(forkContext);
}

function formatNoteTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function goToNoteItem(payload: CloudArchiveItem | { noteId: string; demoId: number }) {
  saveReplayerReturnUrl();
  const noteId = 'noteId' in payload ? payload.noteId : payload.id;
  const demoId = 'demoId' in payload ? payload.demoId : undefined;
  const params = new URLSearchParams({ source: 'cloud', note_id: noteId, tab: 'note' });
  if (demoId != null) params.set('demo_id', String(demoId));
  navigate('/replayer', params.toString());
}

/** 侧边栏使用刷新跳转，保证完整加载目标页 */
function navigateWithReload(path: string) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  window.location.href = base + path;
}

function onNavigateToDemolib() {
  navigateWithReload('/demolib');
}

function onNavigateToNotes() {
  navigateWithReload('/notes');
}

function onNoteDragEnd() {
  draggedNoteIndex.value = null;
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function onNoteDragLeave() {
  dragOverIndex.value = null;
  showDragIndicator.value = false;
  // 清理指示器样式
  clearDragIndicatorPosition();
}

function toggleNoteMenu(id: string) {
  if (openNoteMenuId.value === id) {
    openNoteMenuId.value = null;
    return;
  }
  
  openNoteMenuId.value = id;
  
  // 下一帧计算位置
  nextTick(() => {
    const btn = document.querySelector(`[data-item-id="${id}"]`);
    if (btn) {
      const rect = btn.getBoundingClientRect();
      dropdownPosition.value = {
        top: `${rect.top}px`,
        left: `${rect.right + 4}px`
      };
    }
  });
}

function startRenameNote(item: CloudArchiveItem) {
  renamingNoteId.value = item.id;
  renamingTitle.value = item.title;
  openNoteMenuId.value = null;
  // 下次渲染后聚焦输入框
  nextTick(() => {
    const input = document.querySelector(`.cloud-archive-rename-input[data-id="${item.id}"]`) as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  });
}

async function saveRenameNote() {
  if (!renamingNoteId.value) return;
  const title = renamingTitle.value.trim();
  if (title === '') {
    cancelRenameNote();
    return;
  }
  if (currentUser.value) {
    await updateNoteItem(renamingNoteId.value, { title });
  } else {
    const item = noteList.value.find(i => i.id === renamingNoteId.value);
    if (item) {
      const index = noteList.value.findIndex(i => i.id === renamingNoteId.value);
      if (index !== -1) {
        const newItems = [...noteList.value];
        newItems[index] = { ...item, title };
        await setItems(newItems);
      }
    }
  }
  cancelRenameNote();
}

function cancelRenameNote() {
  renamingNoteId.value = null;
  renamingTitle.value = '';
}

function updateDragIndicatorPosition(index: number, position: 'before' | 'after') {
  const indicator = document.querySelector('.cloud-archive-drag-indicator') as HTMLElement;
  if (!indicator) return;
  
  const item = document.querySelector(`.cloud-archive-item:nth-child(${index + 1})`) as HTMLElement;
  if (!item) return;
  
  const itemRect = item.getBoundingClientRect();
  const listRect = item.parentElement!.getBoundingClientRect();
  
  const topOffset = itemRect.top - listRect.top;
  
  if (position === 'before') {
    indicator.style.top = `${topOffset}px`;
  } else {
    indicator.style.top = `${topOffset + itemRect.height}px`;
  }
}

function clearDragIndicatorPosition() {
  const indicator = document.querySelector('.cloud-archive-drag-indicator') as HTMLElement;
  if (indicator) {
    indicator.style.top = '';
  }
}

// 点击其他地方关闭菜单
function handleClickOutside() {
  openNoteMenuId.value = null;
  cancelRenameNote();
}

function handleSessionExpired() {
  showNoteToast('用户身份过期，需要重新登录', 'warning');
}

declare global {
  interface WindowEventMap {
    'app:toast': CustomEvent<{ message: string; type?: NoteToastType }>;
  }
}
function handleAppToast(e: CustomEvent<{ message: string; type?: NoteToastType }>) {
  showNoteToast(e.detail.message, e.detail.type ?? 'info');
}

// 监听全局点击事件、session 过期、全局 toast
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('click', handleNoteDropdownClickOutside);
  window.addEventListener('open-create-note-modal', handleOpenCreateNoteModal);
  window.addEventListener('session-expired', handleSessionExpired);
  window.addEventListener('app:toast', handleAppToast as EventListener);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('click', handleNoteDropdownClickOutside);
  window.removeEventListener('session-expired', handleSessionExpired);
  window.removeEventListener('app:toast', handleAppToast as EventListener);
});

const draggedNoteIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);
const dragOverPosition = ref<'before' | 'after'>('before');
const showDragIndicator = ref(false);
const openNoteMenuId = ref<string | null>(null);
const renamingNoteId = ref<string | null>(null);
const renamingTitle = ref('');

// Computed properties for selected note preview
const selectedNote = computed(() => {
  if (!selectedNoteId.value) return null;
  return noteList.value.find(note => note.id === selectedNoteId.value) || null;
});

const selectedNoteDemos = computed(() => {
  if (!selectedNote.value) return [];
  return selectedNote.value.demos || [];
});

// State for note dropdown
const showNoteDropdown = ref(false);

/** 判断是否为富文本 HTML（Editor 输出：含 img/span/strong 等），否则按纯文本展示 */
function isContentHtml(content: string): boolean {
  const t = content || '';
  return t.includes('<') && t.includes('>');
}

/** 格式化 demo 时间显示 */
function formatDemoTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/** Extract map name from demo meta */
function getDemoMapName(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.mapName || 'Unknown Map';
    } catch {
      return 'Unknown Map';
    }
  }
  return 'Unknown Map';
}

/** Extract CT team name from demo meta */
function getDemoTeamCT(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.teamCT || 'CT';
    } catch {
      return 'CT';
    }
  }
  return 'CT';
}

/** Extract T team name from demo meta */
function getDemoTeamT(demo: any): string {
  if (demo.demo_meta) {
    try {
      const meta = JSON.parse(demo.demo_meta);
      return meta.teamT || 'T';
    } catch {
      return 'T';
    }
  }
  return 'T';
}

/** Extract add time from demo */
function getDemoAddTime(demo: any): number {
  if (demo.created_at) {
    return new Date(demo.created_at).getTime();
  }
  return Date.now();
}

/** Handle note dropdown icon click (clear selection or toggle dropdown) */
function handleNoteIconClick() {
  if (selectedNoteId.value) {
    // Clear selection
    selectedNoteId.value = null;
    showNoteDropdown.value = false;
  } else {
    // Toggle dropdown
    showNoteDropdown.value = !showNoteDropdown.value;
  }
}

/** Select a note from dropdown */
function selectNote(noteId: string) {
  selectedNoteId.value = noteId;
  showNoteDropdown.value = false;
}

/** Get demo count for a note */
function getNoteDemoCount(note: CloudArchiveItem): number {
  return note.demos?.length || 0;
}

/** Close note dropdown when clicking outside */
function handleNoteDropdownClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.closest('.filter-dropdown-wrapper')) {
    showNoteDropdown.value = false;
  }
}

/** Handle open create note modal event from NoteLibrary */
function handleOpenCreateNoteModal() {
  openCreateNoteModal();
}
const dropdownPosition = ref({});

function onNoteDragStart(e: DragEvent, index: number) {
  draggedNoteIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }
}

function onNoteDragOver(e: DragEvent, index: number) {
  e.dataTransfer!.dropEffect = 'move';
  
  // 获取当前拖拽项的元素
  const currentItem = (e.currentTarget as HTMLElement);
  const rect = currentItem.getBoundingClientRect();
  
  if (rect) {
    const mouseY = e.clientY;
    const rectCenter = rect.top + rect.height / 2;
    
    dragOverIndex.value = index;
    dragOverPosition.value = mouseY < rectCenter ? 'before' : 'after';
    showDragIndicator.value = true;
    
    // 更新指示器的位置样式
    nextTick(() => {
      updateDragIndicatorPosition(index, dragOverPosition.value);
    });
  }
}

function onNoteDrop(toIndex: number) {
  const from = draggedNoteIndex.value;
  if (from === null || from === toIndex) return;
  
  // 根据拖拽位置调整目标索引
  let targetIndex = toIndex;
  if (dragOverPosition.value === 'after' && toIndex < noteList.value.length - 1) {
    targetIndex = toIndex + 1;
  }
  
  onNoteDragEnd();
}

// 根据 URL source/uuid/round 或 note_id 加载 replayer 数据
async function ensureReplayerRouteData() {
  const path = pathRef.value || window.location.pathname;
  const search = searchRef.value ?? window.location.search;
  pathRef.value = path;
  searchRef.value = search;

  const query = getQuery(search);
  const source = query.source ?? null;
  const uuid = query.uuid ?? null;
  const roundNum = parseInt(query.round || '', 10) || 1;
  const noteId = query.note_id ?? null;
  const demoIdRaw = query.demo_id != null ? parseInt(String(query.demo_id), 10) : undefined;
  const demoIdValid = demoIdRaw != null && !Number.isNaN(demoIdRaw) ? demoIdRaw : undefined;

  if (path === '/replayer') {
    replayerPureMode.value = (query.pure === '1' || query.pure === 'true');
  } else {
    replayerPureMode.value = false;
  }

  const isCloud = source === 'cloud' || (noteId && source !== 'local');
  const isLocal = !isCloud && (source === 'local' || uuid);

  if (path !== '/replayer') {
    replayerRouteLoading.value = false;
    return;
  }
  if (!isCloud && !isLocal) {
    replayerRouteLoading.value = false;
    if (currentDemoId.value) {
      const q = getQuery();
      const base = `source=local&uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}`;
      const pure = (q.pure === '1' || q.pure === 'true') ? '&pure=1' : '';
      const tab = (q.tab && ['players', 'rounds', 'note', 'disable'].includes(q.tab)) ? `&tab=${q.tab}` : '';
      replaceLocation('/replayer', base + pure + tab);
    }
    return;
  }

  if (isCloud) {
    if (!noteId) {
      replayerRouteLoading.value = false;
      return;
    }
    const needLoad =
      !replay.value ||
      replayerSource.value !== 'cloud' ||
      replayerNoteId.value !== noteId ||
      (demoIdValid !== undefined && replayerDemoId.value !== demoIdValid);
    if (!needLoad) {
      replayerRouteLoading.value = false;
      currentDemoId.value = replay.value?.uuid ?? null;
      return;
    }
    replayerRouteLoading.value = true;
    currentDemoId.value = null;
    try {
      await waitForInitialLoad();
      await loadReplayByCloud(noteId, demoIdValid);
      currentDemoId.value = replay.value?.uuid ?? null;
    } finally {
      replayerRouteLoading.value = false;
    }
    return;
  }

  if (!uuid) {
    replayerRouteLoading.value = false;
    return;
  }
  const needLoadReplay = !replay.value || replay.value.uuid !== uuid || replayerSource.value !== 'local';
  const needLoadRound = !needLoadReplay && currentRoundNumber.value !== roundNum;
  if (!needLoadReplay && !needLoadRound) {
    replayerRouteLoading.value = false;
    currentDemoId.value = uuid;
    return;
  }
  replayerRouteLoading.value = true;
  currentDemoId.value = uuid;
  try {
    await waitForInitialLoad();
    if (needLoadReplay) {
      await loadReplayByLocal(uuid, roundNum);
    } else if (needLoadRound) {
      await loadRoundData(uuid, roundNum);
    }
  } finally {
    replayerRouteLoading.value = false;
  }
}

onMounted(async () => {
  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (stored !== null) {
    sidebarCollapsed.value = stored === 'true';
  }
  // session 已在 main.ts 中 initAuth 提前校验，此处不再调用 fetchAuthMe 避免重复请求与闪烁
  // 刷新进入 replayer 时立即根据 URL args 加载对局并定位回合
  ensureReplayerRouteData();
  // 等 IndexedDB 初始化完成后再加载云存档，避免刷新后列表为空
  await waitForInitialLoad();
  loadNotes();
});

watch(
  () => ({ path: pathRef.value, search: searchRef.value }),
  () => ensureReplayerRouteData(),
  { deep: true }
);

watch(currentUser, (user) => {
  if (user) loadNotes();
});

watch(sidebarCollapsed, (val) => {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(val));
});

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
};

const DEFAULT_PAGE_TITLE = 'Snowbo | 雪豹';
watch(currentPage, (newPage) => {
  if (newPage !== 'player') {
    replayerPureMode.value = false;
  }
  document.title = newPage === 'player' ? 'Demo 回放 - Snowbo' : DEFAULT_PAGE_TITLE;
}, { immediate: true });

const goToPlayer = () => {
  if (hasSelectedDemo.value) {
    saveReplayerReturnUrl();
    const q = getQuery();
    const pure = (q.pure === '1' || q.pure === 'true') ? '&pure=1' : '';
    const tab = (q.tab && ['players', 'rounds', 'note', 'disable'].includes(q.tab)) ? `&tab=${q.tab}` : '';
    navigate('/replayer', `source=local&uuid=${currentDemoId.value}&round=${currentRoundNumber.value || 1}${pure}${tab}`);
  }
};

const onLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement;
  img.style.display = 'none';
};

/** Demolib 仅通过回合行播放按钮打开 replayer，不再通过卡片点击跳转 */
const onSelectDemo = (_demoId: string) => {
  /* no-op */
};

const onDeleteDemo = async (demoId: string) => {
  console.log('[App] Deleting demo:', demoId);
  await deleteReplayById(demoId);
  if (currentDemoId.value === demoId) {
    currentDemoId.value = null;
  }
  console.log('[App] Demo deleted successfully:', demoId);
};

const onUploadDemo = async (file: File) => {
  await parseDemo(file);
  // No auto-navigation after upload, user must click card to view
};

// Console modal handlers
const handleFrameDataViewer = () => {
  showConsoleModal.value = false;
  // Emit event to ReplayPlayer to trigger frame data viewer
  window.dispatchEvent(new CustomEvent('debug:show-frame-data'));
};

const handleStorageViewer = async () => {
  showConsoleModal.value = false;
  await showReplayStorageDetails();
};

const showBetaWarning = () => {
  showBetaModal.value = true;
};
</script>

<style scoped>
/* === App Layout === */
.app {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--ds-bg-primary-solid);
  color: var(--ds-text-secondary);
}

/* === Sidebar === */
.app-sidebar {
  width: 250px;
  background: var(--ds-bg-secondary);
  border-right: 2px solid var(--ds-border-accent);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

.app-sidebar.collapsed {
  width: 72px;
}

/* === Sidebar Header === */
.sidebar-header {
  height: 72px;
  padding: var(--ds-space-lg) var(--ds-space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: var(--ds-space-md);
  border-bottom: 1px solid var(--ds-border-subtle);
}

.collapsed .sidebar-header {
  justify-content: center;
  padding: var(--ds-space-lg) var(--ds-space-md);
}

.app-branding {
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  min-width: 0;
  flex: 1;
}

.app-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  flex-shrink: 0;
}

.app-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.app-title {
  font-size: var(--ds-text-lg);
  font-weight: 700;
  color: var(--ds-text-primary);
  margin: 0;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.app-subtitle {
  font-size: var(--ds-text-xs);
  font-weight: 500;
  color: var(--ds-text-tertiary);
  margin: 0;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
  opacity: 0.8;
}

.collapse-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--ds-surface-base);
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.collapse-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}


/* === Sidebar Navigation === */
.sidebar-nav {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: var(--ds-space-lg) var(--ds-space-md) var(--ds-space-lg) var(--ds-space-md);
  gap: var(--ds-space-md);
}

/* Demo 本地库 / 云存档：未激活无 border，激活时有 border */
.nav-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ds-radius-md);
  color: rgba(255, 255, 255, 0.9);
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .nav-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.nav-btn svg,
.nav-btn .nav-btn-icon {
  flex-shrink: 0;
}

.nav-btn .nav-btn-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.nav-label {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.collapsed .nav-label,
.collapsed .nav-text {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

.nav-btn:hover:not(:disabled):not(.active) {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-btn:not(.active) svg {
  stroke: currentColor;
}

.nav-btn.active {
  background: rgba(var(--ds-primary-rgb), 0.12);
  color: var(--ds-primary);
  border-color: var(--ds-border-strong);
  box-shadow: 0 0 0 1px var(--ds-border-default);
}

.nav-btn.active:hover:not(:disabled) {
  background: rgba(var(--ds-primary-rgb), 0.18);
  border-color: var(--ds-border-strong);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  color: var(--ds-primary);
}

.nav-btn.active svg,
.nav-btn.active:hover:not(:disabled) svg {
  stroke: var(--ds-primary);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.role-badge {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px 4px 6px; /* 下边距略大，补偿 pro 的 p 下伸，视觉居中 */
  border-radius: 4px;
}

.role-badge-pro {
  background: rgba(34, 197, 94, 0.35);
  color: #22c55e;
}

.role-badge-proplus {
  background: rgba(234, 179, 8, 0.35);
  color: #eab308;
}

/* Modal Form */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-lg);
  margin: 0 0 var(--ds-space-xl);
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

/* Upload Progress */
.upload-progress {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
}

.upload-progress-track {
  height: 8px;
  width: 100%;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.upload-progress-bar {
  height: 100%;
  min-width: 0;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.15s ease;
}

.upload-progress-text {
  text-align: center;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* Share Link */
.share-link-row {
  display: flex;
  align-items: center;
  gap: var(--ds-space-sm);
  margin: 0 0 var(--ds-space-xl);
  padding: var(--ds-space-sm) var(--ds-space-md);
  border-radius: var(--ds-radius-md);
  background: var(--ds-surface-base);
  border: 1px solid var(--ds-border-subtle);
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

.share-link-row:hover {
  background: var(--ds-surface-hover);
}

.share-link-url {
  flex: 1;
  min-width: 0;
  font-family: var(--ds-font-mono, 'Consolas', 'Monaco', monospace);
  font-size: var(--ds-text-xs);
  color: var(--ds-text-primary);
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.share-link-url::-webkit-scrollbar {
  display: none;
}

.share-link-copy {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ds-radius-sm);
  background: var(--ds-surface-elevated);
  color: var(--ds-text-secondary);
  transition: all 0.15s;
}

.share-link-copy-icon {
  width: 14px;
  height: 14px;
}

.share-link-row:hover .share-link-copy {
  background: var(--ds-accent-primary);
  color: white;
}

/* 占满中间空间，使 Beta / Console 固定在底部 */
.sidebar-spacer {
  flex: 1;
  min-height: 0;
}

/* === Beta Button Section === */
.sidebar-beta-section {
  padding: var(--ds-space-lg) var(--ds-space-md);
  flex-shrink: 0;
}

.beta-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: rgba(255, 193, 7, 0.1);
  border: none;
  border-radius: var(--ds-radius-md);
  color: #ffc107;
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .beta-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.beta-btn:hover {
  background: rgba(255, 193, 7, 0.2);
  box-shadow: 0 2px 8px rgba(255, 193, 7, 0.2);
}

.beta-btn-text {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #ffc107;
  text-align: center;
}

/* === Sidebar Footer (Debug Section) === */
.sidebar-footer {
  padding: var(--ds-space-lg) var(--ds-space-md);
  border-top: 1px solid var(--ds-border-subtle);
  flex-shrink: 0;
}

/* Console / 设置按钮：白色调 */
/* Console / 设置按钮：蓝色调 */
.console-toggle-btn {
  width: 100%;
  min-height: 48px;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: rgba(74, 171, 247, 0.1);
  border: 1px solid rgba(74, 171, 247, 0.3);
  border-radius: var(--ds-radius-md);
  color: #4dabf7;
  font-size: var(--ds-text-base);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  gap: var(--ds-space-md);
  text-align: left;
}

.collapsed .console-toggle-btn {
  justify-content: center;
  padding: var(--ds-space-md);
}

.console-toggle-btn:hover {
  background: rgba(74, 171, 247, 0.2);
  border-color: rgba(74, 171, 247, 0.5);
  box-shadow: 0 2px 8px rgba(74, 171, 247, 0.2);
  color: #4dabf7;
}

.console-toggle-btn svg {
  stroke: currentColor;
}

/* === Main Content === */
.app-main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.app-page-header {
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* === Parsing Modal === */
.parsing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-primary);
  backdrop-filter: blur(4px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.parsing-modal {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  padding: var(--ds-space-3xl);
  width: 500px;
  max-width: 90vw;
  box-shadow: var(--ds-shadow-xl);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.parsing-modal h3 {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-primary);
  text-align: center;
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.spinner-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: var(--ds-space-2xl) 0;
}

.parsing-progress-bar-wrap {
  width: 100%;
  height: 8px;
  background: var(--ds-border-subtle);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 0 var(--ds-space-lg) 0;
}

.parsing-progress-bar-fill {
  height: 100%;
  background: var(--ds-primary);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid var(--ds-border-subtle);
  border-top-color: var(--ds-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.parsing-status {
  margin: var(--ds-space-sm) 0 0 0;
  color: var(--ds-text-tertiary);
  text-align: center;
  font-size: var(--ds-text-base);
  min-height: 24px;
  line-height: 24px;
  animation: fade-in 0.3s ease-in;
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* === Beta Warning Modal === */
.beta-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--ds-bg-overlay);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ds-z-modal);
  animation: fadeIn 0.2s ease;
}

.beta-modal {
  max-width: 400px;
  width: 90vw;
  padding: var(--ds-space-3xl);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-xl);
  text-align: center;
  animation: slideUp 0.3s ease;
  position: relative;
  backdrop-filter: blur(20px);
}

/* 战术笔记发布/编辑页：更大 modal，content 区域做大 */
.beta-modal--note-form {
  max-width: 800px;
  width: 92vw;
  text-align: left;
}

.beta-modal--note-form .modal-title {
  text-align: center;
}

.beta-modal--note-form .modal-form {
  margin-bottom: var(--ds-space-xl);
}

.beta-modal--note-form .note-form-editor-wrap {
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.beta-modal--note-form .note-form-editor-wrap .doc-editor {
  flex: 1;
  min-height: 0;
}

.beta-modal .modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--ds-primary);
  width: 64px;
  height: 64px;
  background: rgba(var(--ds-primary-rgb), 0.12);
  border-radius: var(--ds-radius-full);
  margin-left: auto;
  margin-right: auto;
  padding: var(--ds-space-md);
}

.modal-icon-svg {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.beta-modal .modal-icon.success {
  color: var(--ds-success);
  background: rgba(63, 185, 80, 0.15);
}

.beta-modal .modal-icon.success .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(58%) sepia(42%) saturate(1200%) hue-rotate(95deg) brightness(95%) contrast(89%);
}

.beta-modal .modal-icon.error {
  color: var(--ds-danger, #ef4444);
  background: rgba(239, 68, 68, 0.1);
}

.beta-modal .modal-icon.error .modal-icon-svg {
  filter: brightness(0) saturate(100%) invert(29%) sepia(88%) saturate(3207%) hue-rotate(342deg) brightness(95%) contrast(97%);
}

.beta-modal .modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.beta-modal .modal-message {
  margin: 0 0 var(--ds-space-xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

.beta-modal .modal-message.success {
  color: var(--ds-success, #10b981);
}

.beta-modal .modal-message.error {
  color: var(--ds-danger, #ef4444);
}

.beta-modal .modal-actions {
  display: flex;
  gap: var(--ds-space-md);
  justify-content: center;
}

.beta-modal .modal-actions .ds-btn-primary {
  width: auto;
  min-width: 80px;
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary {
  width: auto;
  min-width: 80px;
  background: transparent;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-secondary);
  transition: all var(--ds-transition-base);
}

.beta-modal .modal-actions .ds-btn-secondary:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
  border-color: var(--ds-border-strong);
  transform: translateY(-2px);
}

.ds-btn-primary {
  width: 100%;
  padding: var(--ds-space-md) var(--ds-space-lg);
  background: var(--ds-primary);
  border: 1px solid var(--ds-primary);
  border-radius: var(--ds-radius-md);
  color: var(--ds-primary-text);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ds-space-md);
}

.ds-btn-primary:hover {
  background: var(--ds-primary-hover);
  border-color: var(--ds-primary-hover);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

.ds-btn-primary.ds-btn-danger {
  background: var(--ds-danger, #ef4444);
  border-color: var(--ds-danger, #ef4444);
  color: #fff;
}

.ds-btn-primary.ds-btn-danger:hover {
  background: #dc2626;
  border-color: #dc2626;
}

/* === Modal Tabs === */
.modal-tabs {
  display: flex;
  gap: var(--ds-space-sm);
  margin: var(--ds-space-xl) 0;
  border-bottom: 1px solid var(--ds-border-default);
  padding-bottom: var(--ds-space-md);
}

.modal-tab {
  padding: var(--ds-space-md) var(--ds-space-xl);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  flex: 1;
  text-align: center;
}

.modal-tab:hover {
  color: var(--ds-text-primary);
  background: var(--ds-surface-hover);
}

.modal-tab.active {
  color: var(--ds-primary);
  border-bottom-color: var(--ds-primary);
  background: var(--ds-surface-hover);
}

.form-label {
  display: block;
  margin-bottom: var(--ds-space-sm);
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
}

.form-select {
  width: 100%;
  padding: var(--ds-space-md);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  color: var(--ds-text-primary);
  font-size: var(--ds-text-base);
  cursor: pointer;
  transition: all var(--ds-transition-base);
}

.form-select:focus {
  outline: none;
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.form-info {
  margin-top: var(--ds-space-lg);
  padding: var(--ds-space-md);
  background: var(--ds-surface-subtle);
  border-radius: var(--ds-radius-md);
  border-left: 3px solid var(--ds-primary);
}

.form-info p {
  margin: 0;
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
}

.modal-close-btn {
  position: absolute;
  top: var(--ds-space-lg);
  right: var(--ds-space-lg);
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--ds-radius-sm);
  color: var(--ds-text-tertiary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close-btn:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.modal-close-btn:active {
  transform: scale(0.95);
}

.modal-icon {
  margin-bottom: var(--ds-space-xl);
  display: flex;
  justify-content: center;
  align-items: center;
}

.modal-title {
  margin: 0 0 var(--ds-space-md) 0;
  color: var(--ds-text-primary);
  font-size: var(--ds-text-xl);
  font-weight: 600;
}

.modal-message {
  margin: 0 0 var(--ds-space-2xl) 0;
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-base);
  line-height: 1.6;
}

/* Demo attachments list */
.demo-attachments-list {
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  background: var(--ds-bg-secondary);
  max-height: 200px;
  overflow-y: auto;
}

.demo-attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--ds-border-default);
  transition: background-color 0.2s;
}

.demo-attachment-item:last-child {
  border-bottom: none;
}

.demo-attachment-item:hover {
  background: var(--ds-bg-hover);
}

.demo-attachment-item.marked-for-deletion {
  background: var(--ds-bg-danger-subtle);
  opacity: 0.7;
}

.demo-attachment-item.marked-for-deletion .demo-uuid,
.demo-attachment-item.marked-for-deletion .demo-round {
  text-decoration: line-through;
  color: var(--ds-text-danger);
}

.demo-attachment-info {
  flex: 1;
  min-width: 0;
}

.demo-attachment-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.demo-uuid {
  font-family: monospace;
  font-size: 12px;
  color: var(--ds-text-secondary);
  background: var(--ds-bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.demo-round {
  font-size: 13px;
  color: var(--ds-text-primary);
  font-weight: 500;
}

.demo-attachment-size {
  font-size: 12px;
  color: var(--ds-text-secondary);
}

.demo-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  background: var(--ds-bg-primary);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.demo-delete-btn:hover {
  border-color: var(--ds-border-danger);
  color: var(--ds-text-danger);
  background: var(--ds-bg-danger-subtle);
}

.demo-delete-btn.marked {
  border-color: var(--ds-border-danger);
  background: var(--ds-bg-danger);
  color: var(--ds-text-on-danger);
}

.demo-delete-btn.marked:hover {
  background: var(--ds-bg-danger-emphasis);
}

/* Existing content preview */
.existing-content-preview {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 14px;
}

.existing-title {
  margin-bottom: 12px;
  color: var(--ds-text-primary);
}

.existing-content {
  margin-bottom: 16px;
  color: var(--ds-text-primary);
}

.content-preview {
  background: var(--ds-bg-tertiary);
  border-radius: 4px;
  padding: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--ds-text-secondary);
  white-space: pre-wrap;
  max-height: 100px;
  overflow-y: auto;
}

.existing-demos {
  color: var(--ds-text-primary);
}

.demo-list-preview {
  margin-top: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.demo-preview-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--ds-bg-tertiary);
  border-radius: 4px;
  margin-bottom: 6px;
  font-size: 12px;
}

.demo-preview-item:last-child {
  margin-bottom: 0;
}

.demo-preview-item .demo-uuid {
  font-family: monospace;
  background: var(--ds-bg-input);
  padding: 2px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.demo-preview-item .demo-round {
  color: var(--ds-text-primary);
  font-weight: 500;
}

.demo-preview-item .demo-size {
  margin-left: auto;
  color: var(--ds-text-secondary);
}

/* New attachment preview */
.new-attachment-preview {
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 20px;
  font-size: 14px;
}

.new-attachment-header {
  margin-bottom: 12px;
  color: var(--ds-text-primary);
}

.new-attachment-item {
  background: var(--ds-bg-tertiary);
  border-radius: 6px;
  padding: 16px;
  border: 2px solid transparent;
}

.new-item-highlight {
  border-bottom: 3px solid var(--ds-success);
  background: linear-gradient(to bottom, var(--ds-bg-tertiary), rgba(63, 185, 80, 0.05));
}

.demo-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

/* Selected Note Preview Styles */
.selected-note-preview {
  margin: 20px 0;
  padding: 16px;
  background: var(--ds-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--ds-border-default);
}

.preview-section {
  margin-bottom: 16px;
}

.preview-section:last-child {
  margin-bottom: 0;
}

.preview-title {
  font-size: var(--ds-text-sm);
  font-weight: 600;
  color: var(--ds-text-primary);
  margin: 0 0 8px 0;
}

.preview-content {
  padding: 12px;
  background: var(--ds-bg-primary-solid);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
  min-height: 60px;
}

.content-text {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.content-text.content-html {
  white-space: normal;
}

.content-empty {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-tertiary);
  font-style: italic;
}

.demo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-item {
  padding: 12px;
  background: var(--ds-bg-primary-solid);
  border-radius: 6px;
  border: 1px solid var(--ds-border-default);
}

.demo-info {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: var(--ds-text-xs);
}

.demo-map {
  font-weight: 600;
  color: var(--ds-text-primary);
}

.demo-teams {
  color: var(--ds-text-secondary);
}

.demo-time {
  color: var(--ds-text-tertiary);
  margin-left: auto;
}

/* Edit Modal Styles */
.demo-items-section {
  margin-top: var(--ds-space-xl);
  padding-top: var(--ds-space-lg);
  border-top: 1px solid var(--ds-border-subtle);
}

.section-title {
  margin: 0 0 var(--ds-space-md) 0;
  font-size: var(--ds-text-lg);
  font-weight: 600;
  color: var(--ds-text-primary);
}

.demo-items-list {
  display: flex;
  flex-direction: column;
  gap: var(--ds-space-sm);
}

.demo-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ds-space-md);
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--ds-radius-md);
  transition: all var(--ds-transition-base);
}

.demo-item-card:hover {
  background: var(--ds-surface-hover);
  border-color: var(--ds-border-default);
}

.demo-item-card.marked-for-deletion {
  background: rgba(239, 68, 68, 0.05);
  border-color: rgba(239, 68, 68, 0.2);
}

.demo-item-card.marked-for-deletion .demo-meta-line {
  text-decoration: line-through;
  color: var(--ds-text-danger, #dc2626);
  opacity: 0.9;
}

.demo-item-info {
  flex: 1;
  min-width: 0;
}

.demo-meta-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ds-space-sm);
}

.demo-icon {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.demo-map-name {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-text-sm);
  font-weight: 500;
  color: var(--ds-text-primary);
  white-space: nowrap;
}

.demo-teams {
  font-size: var(--ds-text-sm);
  color: var(--ds-text-secondary);
  white-space: nowrap;
}

.demo-time {
  font-size: var(--ds-text-xs);
  color: var(--ds-text-tertiary);
  margin-left: auto;
}

.demo-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-sm);
  background: var(--ds-surface-base);
  color: var(--ds-text-secondary);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  flex-shrink: 0;
}

.demo-delete-btn:hover {
  background: var(--ds-error, #ef4444);
  border-color: var(--ds-error, #ef4444);
  color: white;
}

.demo-delete-btn.delete-marked {
  background: var(--ds-error, #ef4444);
  border-color: var(--ds-error, #ef4444);
  color: white;
}

.demo-delete-btn.delete-marked:hover {
  background: var(--ds-error-dark, #dc2626);
  border-color: var(--ds-error-dark, #dc2626);
}

/* Note Archive Dropdown Styles (matching NoteLibrary map filter) */
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
  width: 100%;
  min-height: 36px;
  cursor: pointer;
  transition: all var(--ds-transition-base);
  box-sizing: border-box;
}

.filter-tags-input.has-selection {
  background: rgba(var(--ds-primary-rgb), 0.15);
  border-color: var(--ds-border-strong);
}

.filter-tags-input.has-selection:hover {
  background: rgba(var(--ds-primary-rgb), 0.2);
  border-color: var(--ds-border-strong);
}

.filter-tags-input:hover {
  border-color: var(--ds-border-strong);
}

.filter-tags-input:focus-within {
  border-color: var(--ds-primary);
  box-shadow: 0 0 0 3px rgba(var(--ds-primary-rgb), 0.12);
}

.filter-selection-text {
  flex: 1;
  color: var(--ds-primary);
  font-size: var(--ds-text-sm);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-placeholder {
  flex: 1;
  color: var(--ds-text-tertiary);
  font-size: var(--ds-text-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ds-text-tertiary);
  transition: color var(--ds-transition-base);
}

.filter-icon:hover {
  color: var(--ds-text-primary);
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--ds-bg-secondary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--ds-radius-md);
  box-shadow: var(--ds-shadow-xl);
  max-height: 300px;
  overflow-y: auto;
  z-index: 100;
}

.filter-dropdown-item {
  padding: var(--ds-space-sm) var(--ds-space-md);
  color: var(--ds-text-secondary);
  font-size: var(--ds-text-sm);
  cursor: pointer;
  transition: all var(--ds-transition-base);
  border-bottom: 1px solid var(--ds-border-subtle);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-dropdown-item:last-child {
  border-bottom: none;
}

.filter-dropdown-item:hover {
  background: var(--ds-surface-hover);
  color: var(--ds-text-primary);
}

.filter-dropdown-item.selected {
  background: rgba(var(--ds-primary-rgb), 0.15);
  color: var(--ds-primary);
  font-weight: 600;
}

.dropdown-item-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-item-count {
  font-size: var(--ds-text-xs);
  font-weight: 600;
  color: var(--ds-text-secondary);
  font-variant-numeric: tabular-nums;
}

.demo-map {
  font-weight: 600;
  color: var(--ds-text-primary);
  background: var(--ds-bg-success-subtle);
  padding: 4px 8px;
  border-radius: 4px;
}

.demo-teams {
  color: var(--ds-text-secondary);
}

.demo-round {
  font-weight: 500;
  color: var(--ds-text-primary);
}

.demo-source {
  font-size: 12px;
  color: var(--ds-text-success);
  font-style: italic;
}
</style>
