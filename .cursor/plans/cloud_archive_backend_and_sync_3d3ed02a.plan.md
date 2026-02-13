---
name: Cloud Archive Backend and Sync
overview: 将云存档从纯本地 IndexedDB 升级为与用户绑定的真实云端能力：后端提供存档表与树表、文件存储（SNOWBO_STORAGE_ROOTPATH）、鉴权与 CRUD/排序 API；前端保留本地优先读取，缺失时从云端拉取，支持上传进度、编辑、删除、拖拽排序，并需登录后使用。
todos: []
isProject: false
---

# 云存档关联用户与真实云端实现计划

## 现状摘要

- **前端**：`[frontend/src/composables/useCloudArchive.ts](frontend/src/composables/useCloudArchive.ts)` 仅用 IndexedDB 单 key 存 `CloudArchiveItem[]`（id, title, demo_uuid, demo_round, add_time, mapName, teamCT, teamT）；`[App.vue](frontend/src/App.vue)` 侧栏展示、添加/删除/重命名/拖拽排序、跳转 `/replayer?uuid=...&round=...`。添加时只写入 meta，不传文件。
- **回放数据**：`[useReplayData.ts](frontend/src/composables/useReplayData.ts)` 的 `loadRoundData(uuid, roundNumber)` 仅从 OPFS 读 `replays/{uuid}/round_{round}.pb`；无云端回源。
- **后端**：仅有 auth 相关 API；无存档或文件存储逻辑。

## 目标行为（简要）

1. 每条存档落库，含名称、owner、权限(private/public)、meta(JSON)、round 相关字段等；默认 private，访问需鉴权。
2. 用户维度的「云存档树」单条记录存 JSON，表示顺序（及可选结构）。
3. 上传：带进度；文件存 `SNOWBO_STORAGE_ROOTPATH/{uid}/{archive_id}/round.pb`（单回合一条存档对应一个 round 文件）。
4. 可上传、删除、编辑（如标题/权限）、拖拽排序。
5. 访问：先读本地 OPFS，若无则用 archive_id 从云端拉取（需鉴权）。

---

## 一、数据模型与存储（后端）

### 1. 环境变量

- 文件根目录：`SNOWBO_STORAGE_ROOTPATH`（必配，否则上传/下载相关 API 可返回 503 或 400）。

### 2. 表设计（GORM，MySQL）

**表 `archive_items`（单条存档，反范式）**

- `id`：主键。
- `owner`：所属用户（owner），user id。
- `title`：名称。
- `permission`：`private` / `public`，默认 `private`。
- `demo_uuid`：关联的 demo UUID（与现有前端一致）。
- `demo_round`：回合号。
- `demo_meta`：JSON，存 demometa等扩展信息。
- `created_at`、`updated_at`、deleted_at
- `file_path` （如 `{uid}/{archive_id}/round.pb`），便于清理与校验。

**表 `user_archive_trees`（每用户一条，存顺序）**

- id: key
- `user_id`：唯一。
- `tree`：JSON，例如 `{"order": ["id1","id2",...]}` 或 `{ "item_ids": ["id1","id2"] }`，表示云存档列表顺序。
- `updated_at`。

### 3. 文件存储约定

- 根目录：`os.Getenv("SNOWBO_STORAGE_ROOTPATH")`。
- 路径：`{root}/{user-uid}/{archive_id}/round.pb`（单回合一条存档一个文件；若将来支持多回合可扩展为 `round_1.pb` 等）。
- 上传时：校验用户、创建 DB 记录并生成 `archive_id`，再写入文件；失败时尽量清理已写文件或占位。

---

## 二、后端 API 设计（均 JSON，除文件流）

- **GET /api/archive/items**  
  - 需登录。返回当前用户的存档列表（含每条 id, title, permission, demo_uuid, demo_round, meta, created_at 等）；顺序来自 `user_archive_trees`。可同时返回 `tree.order` 供前端严格按序展示。
- **POST /api/archive/items**  
  - 需登录。  
  - Body: multipart/form-data：`file`（round 的 .pb 二进制）、`title`、`demo_uuid`、`demo_round`、`permission`（可选，默认 private）、`meta`（可选 JSON 字符串）。  
  - 逻辑：生成 archive_id，写 DB，写文件到 `{root}/{uid}/{archive_id}/round.pb`，并更新对应用户的 tree（新 id append 到 order）。  
  - 响应：`{ ok, data: { id, title, ... } }`。  
  - 上传进度：依赖前端分块或流式上传时可考虑 `Content-Range` 或单独 progress 端点；若先采用「整文件 POST」，则可在后端读取 request body 时配合 `io.LimitReader`/已读字节数上报进度（或首版仅前端模拟进度，后端一次性保存）。
- **PATCH /api/archive/items/:id**  
  - 需登录；校验 owner 或可编辑权限。  
  - Body: JSON，可更新 `title`、`permission`、`meta` 等（不在此接口改文件）。
- **DELETE /api/archive/items/:id**  
  - 需登录；校验 owner。删除 DB 记录，删除文件 `{root}/{uid}/{archive_id}/round.pb`，并从对应用户的 tree 中移除该 id。
- **PUT /api/archive/tree**  
  - 需登录。  
  - Body: `{ "order": ["id1","id2",...] }`。用该数组覆盖当前用户的 `user_archive_trees.tree`（或仅更新 order 字段）。
- **GET /api/archive/items/:id/file**  
  - 需登录或根据 permission 鉴权：若 private 则仅 owner 可下；若 public 则允许其他登录用户（或按产品决定是否支持未登录只读）。  
  - 响应：直接流式返回 round.pb 二进制（Content-Type: application/octet-stream），或附 Content-Disposition。  
  - 未授权或不存在返回 403/404。

---

## 三、后端实现要点（pkg 与 cmd）

- **pkg/archive**（新建）  
  - `model.go`：ArchiveItem、UserArchiveTree 的 GORM 模型。  
  - `store.go`：ArchiveItem 的 CRUD；按 user_id 查列表；UserArchiveTree 的 Get/Update（含整树 JSON）。  
  - `storage.go` 或内联：读 `SNOWBO_STORAGE_ROOTPATH`；实现 `SaveFile(uid, archiveID string, r io.Reader) error`、`GetFile(uid, archiveID string) (io.ReadCloser, error)`、`DeleteFile(uid, archiveID string) error`，路径为 `{root}/{uid}/{archive_id}/round.pb`。
- **pkg/auth 或 middleware**  
  - 复用现有 session 中间件；从 context 取 current user；对 archive 的写与 private 读均校验 owner。
- **cmd/server/main.go**  
  - 若配置了 DB 与 `SNOWBO_STORAGE_ROOTPATH`，注册上述路由；否则相关 API 返回 503 或 400，并打日志。  
  - 上传接口用 `multipart.Form` 解析，限制 body 大小，防止滥用。
- **表初始化**  
  - 在 main 或 pkg/database 的 migrate 中 `AutoMigrate` ArchiveItem、UserArchiveTree；若 database 包不直接依赖 archive，可在 main 里对这两张表做 migrate。

---

## 四、前端改造要点

### 1. 数据流与登录态

- 云存档区域仅在已登录时可用（或未登录时展示「请先登录」并禁用添加）。  
- 进入页面或侧栏展开时：若已登录则请求 `GET /api/archive/items`，用返回列表 + tree.order 作为「云存档」数据源；未登录可继续用现有本地 IndexedDB 列表（仅本地）或置空。

### 2. 上传与进度

- **保存到云存档**：当前是 `handleAddToArchive` 仅写 IndexedDB。改为先取当前回合的 round 数据：从 OPFS 读 `round_{N}.pb`（或通过 useReplayData 暴露的已有 round 字节），若没有则提示「请先加载该回合」；有则 `POST /api/archive/items`（multipart：file + title + demo_uuid + demo_round + permission + meta）。  
- 上传进度：用 `XMLHttpRequest` 的 `upload.onprogress` 或 `fetch` + `ReadableStream` 分块上传（若后端支持）驱动进度条；否则可在「开始上传」到「响应返回」之间做简单 indeterminate 或模拟进度。  
- 成功：后端返回新 item（含 id）；前端将该条加入列表并更新 tree（或直接重新拉取列表）；同时可选写入本地 IndexedDB 一份「云存档条目」用于离线展示占位，或仅以服务端为准。

### 3. 本地优先 + 云端回源

- **loadRoundData(uuid, roundNumber)**（或 ReplayPlayer 内等效逻辑）：  
  - 先 `storage.loadRound(uuid, roundNumber)`（OPFS）读 round.pb。  
  - 若得到数据则照旧解码、设帧。  
  - 若为 null：若当前进入 replayer 时带有 `archive_id`（例如从云存档点击进入时 URL 带 `archive_id=xxx`），则请求 `GET /api/archive/items/:id/file`，将响应流写入内存或临时 ArrayBuffer，解码后设帧；并可选将此次拉取的 bytes 写入 OPFS（`saveRound(uuid, roundNum, bytes)`），以便下次本地命中。  
  - 若没有 archive_id 且本地没有，则保持当前「未找到」行为（不拉取云端）。
- **goToArchiveItem(item)**：若 item 来自云端且含 `id`，跳转时带上：`/replayer?uuid=...&round=...&archive_id=...`，以便上面回源使用。

### 4. 编辑、删除、排序

- **编辑**：调用 `PATCH /api/archive/items/:id` 更新 title/permission/meta；成功后刷新列表或乐观更新。  
- **删除**：调用 `DELETE /api/archive/items/:id`；成功后从列表移除并刷新 tree；若当前正在播放该存档则退出或清空。  
- **拖拽排序**：拖拽结束后得到新顺序数组，调用 `PUT /api/archive/tree`；成功后本地更新 order 或重新拉取列表。

### 5. 权限与鉴权

- 默认 private；访问 `GET /api/archive/items/:id/file` 时后端校验：private 仅 owner 可下，public 可按产品约定开放。前端在无权限时展示错误或 toast（如「无权限访问」）。

---

## 五、文件与模块清单（建议）


| 类型  | 路径                                          | 说明                                                              |
| --- | ------------------------------------------- | --------------------------------------------------------------- |
| 新建  | pkg/archive/model.go                        | ArchiveItem、UserArchiveTree 模型                                  |
| 新建  | pkg/archive/store.go                        | 存档与树的 CRUD                                                      |
| 新建  | pkg/archive/storage.go                      | 基于 SNOWBO_STORAGE_ROOTPATH 的文件读写删                               |
| 新建  | pkg/archive/handler.go                      | 上述 API 的 HTTP 实现（需 session 注入 user）                             |
| 修改  | cmd/server/main.go                          | 注册 /api/archive/* 路由；migrate 两张表；校验 STORAGE_ROOTPATH            |
| 修改  | frontend/src/composables/useCloudArchive.ts | 登录时拉取服务端列表+tree；未登录可保留本地只读或置空；add/remove/update/reorder 改为调 API |
| 修改  | frontend/src/App.vue                        | 云存档区依赖登录；上传时带进度条；goToArchiveItem 带 archive_id                   |
| 修改  | frontend/src/composables/useReplayData.ts   | loadRoundData 在 OPFS 未命中且有 archive_id 时请求 GET .../file 并回填 OPFS |


---

## 六、补充与边界

- **archive_id 生成**：短 UUID，保证唯一且便于路径安全。  
- **meta 字段**：存 demo meta，需要脱敏一些本地路径字段等，其余扩展放同一 JSON。  
- **tree 表**：若只存顺序，可 `{"order":["id1","id2"]}`；若将来要分组/文件夹再扩展 JSON 结构。  
- **上传大小限制**：后端对 multipart 的 MaxBytesReader 设合理上限（如 50MB），防止大文件拖垮服务。  
- **错误与 401**：上传/下载/列表等接口在 401 时前端统一走现有 session 过期 toast 与清除登录态逻辑。

按上述实现后，云存档与用户绑定、落库落盘，支持上传进度、本地优先与云端回源、编辑/删除/排序，且默认 private 并鉴权访问。