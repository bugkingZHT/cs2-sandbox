# Ancient 三维战术白模

> 历史封顶重建模式，使用 `export-ancient-map.ps1 -Mode collision`。当前已恢复[第一版原始模型去顶方案](ancient-3d.md)，下述体量和验证结果仅对应封顶重建资源。

浏览器只加载 `frontend/public/map/3d/de_ancient.json`，不加载 VPK、贴图或原始高精模型。实际碰撞截面提供墙体轮廓，原始 NAV 保留行走高度，真实屋顶投影用于填实不可进入建筑。用户游戏文件保持不变。

## 来源与坐标

- `de_ancient.vpk`：405,423,836 字节。
- `maps/de_ancient/world_physics.vmdl_c` 内嵌物理碰撞：967,742 个三角形。
- 桌面 `de_ancient.nav` 玩家 hull 0：2,680 个三角形，保留原高度和坡度，输出精度 0.01 世界单位。VPK 内 NAV 与桌面文件 SHA-256 相同。
- A/B 包点来自 `default_ents.vents_c` 的 `func_bomb_target` designation 及对应触发模型 `unnamed_2_33011.vmdl_c` / `unnamed_2_33013.vmdl_c` 的真实 bounds。

```text
VPK SHA-256 db67fb7c45e4a92a87473dc8d9dae0b5ead6887e282ecd7d98076f5c01af0d26
NAV SHA-256 967c483c0e2e4471834a9e0ba80432c8e9a8114e61ff5a6fb08c32b7331fc6d4
```

NAV 只提供地面、参考高度和通路保护，墙体不是把 NAV 边界拉高制造出来的。资产保留 Source/Demo XYZ，渲染层统一映射 `(x,y,z) → (x,z,-y)`，不预先居中、旋转或缩放。

## 当前资产

| 项目 | 数值 |
| --- | --- |
| JSON | 509,510 字节，约 497.57 KiB |
| 三角形 / 索引顶点 | 20,625 / 13,776 |
| NAV 地面 / 台阶封口 | 2,680 / 126 面 |
| 非 NAV 补地 / 外裙边 | 4,967 / 800 面 |
| 连通低墙与封顶建筑 | 12,052 面 |
| 闭合平顶实体 / 高度档位 | 147 / 10 |
| 屋顶证据填实分区 | 43，非独立建筑数量 |
| 材质批次 | 3：ground、terrain、wall |
| 开口墙边 / 退化面 / 分区面积误差 | 0 / 0 / 0 |
| Demo XYZ bounds | `[-2436,-2664,-200]` → `[1524,1896,336]` |
| A / B 包点 | `[-1392,844,57]` / `[886.5,62,133]` |

最终 JSON SHA-256：`1039034174adb793d1dd5fb6a6389eda48b1daca0f19f5d5381a58850d21de34`。

最初裸裁碰撞版是 76,138 面、约 2.79 MiB。当前使用闭合低墙和平顶建筑替代裸裁薄片，保留连接与门洞；不以极低面数换取断墙。发布预算为 2 MiB / 35,000 面。

## 重建步骤

1. 使用 [Source 2 Viewer CLI](https://s2v.app/ValveResourceFormat/guides/command-line.html) 20.0 导出临时 GLB。VRF 顶点仍为 Source XYZ，坐标和米制转换位于节点矩阵；读取器验证矩阵后只读原始顶点，避免重复转换。
2. 排除 `playerclip`、`npcclip`、`csgo_grenadeclip`、`passbullets`、`window` 等辅助体积。采样局部 NAV 高度上方约 40 / 64 / 88 单位的碰撞截面，切片步长 16、水平网格 12。斜顶、斜底与视域外出入边参与完整截面计算；扫描行采用半开端点，避免共享顶点重复计数。
3. Source 碰撞含开放单面，不能直接用全局 `winding != 0` 判断实心。根据外法线配对有限进入/离开区间，未匹配的开放面只保留实际截面边线，避免幽灵墙无限延伸。低墙保留距 NAV 128 单位内的结构，闭合一格小缝并删除微小孤岛。
4. 全局墙轮廓只做一次 10 单位容差简化，再减去精确 NAV 投影。不再把全部 NAV 扩张 16 单位而吞掉相邻薄墙。高度区域依次取全局轮廓的交集与余集，验证分区并集面积一致，避免各档独立简化造成断墙。
5. 低墙按 48 单位分档，墙高 96。每个实体都有共面顶盖、底盖和完整侧面；基础通常下伸 32，遇相邻源墙较大高差时局部下延保持连接。侧面使用实际三角化盖面的边界；点接触三角扇分开索引，防止焊成非流形边。外裙边内退 2 单位避免共面闪烁。
6. 建筑填实依赖真实屋顶证据。低墙围合且无 NAV 的孔要求屋顶投影覆盖至少 75%；低墙不闭合时，从连续原屋顶投影提取建筑核心，仅添加距 NAV 超过 32、面积至少 2,048 平方单位的部分，并先减掉已有墙，避免抬高真实薄墙。上表面与下表面均可提供证据，参考高度为附近 NAV 上方 48 至 768 单位。通常要求法线高度分量至少 0.65；0.3 至 0.65 的陡顶只可沿既有屋顶证据连续延伸最多 96 单位，孤立斜墙不会自行成为屋顶。每个屋顶内部使用周边最高低墙档位的单一平盖，没有顶面证据的庭院仍开放。
7. 原始 2,680 个 NAV 三角形不减面。非 NAV 补地以差集避开原地面，减面时锁定 NAV 转角点，台阶同 XY 高度断层补竖向封口。平滑只作用于支撑地形，外围填充不代表精确关卡地面。
8. [meshoptimizer](https://github.com/zeux/meshoptimizer/tree/master/js) 0.25.0 仅简化补地和外沿，误差参数 3；[earcut](https://github.com/mapbox/earcut) 3.0.2 填盖，[polygon-clipping](https://github.com/mfogel/polygon-clipping) 0.15.7 处理布尔运算。最后按材质拼成三批，保留独立封闭壳索引，不把接触的实体强行焊接。

这是 12 世界单位网格尺度的战术抽象模型。主墙形、门洞、通路和 NAV 高差有实际来源，屋顶高度、窄凹槽及小装饰经过简化。它不是精确碰撞、视野射线或投掷物物理代理；玩家始终依 Demo XYZ 运动，不被地面强制吸附。历史 Demo 可能来自不同地图版本。

## 重建命令

需要 Windows x64、Node.js 和 pnpm 或 npm。首次运行下载固定 CLI 20.0，校验压缩包 SHA-256，在 Git 忽略的 `tmp/ancient-source/` 安装固定构建依赖，不修改前端运行时依赖。

```powershell
pwsh -File tools/export-ancient-map.ps1 `
  -Vpk 'C:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/maps/de_ancient.vpk' `
  -Nav "$env:USERPROFILE/Desktop/de_ancient.nav"
```

支持 `-WorkDirectory`、`-Output`。正常运行重新提取 VPK/NAV；调参时可显式复用中间文件：

```powershell
node tools/export-ancient-map.mjs --reuse-exports true --diagnostics true
```

Node 转换器支持 `--cli`、`--vpk`、`--nav`、`--work`、`--meshopt`、`--earcut`、`--clipping`、`--out`。诊断文件不发布。几何位于 `tools/ancient-whitebox-geometry.mjs`，提取与清单位于 `tools/export-ancient-map.mjs`；没有跳过闭合检查的发布参数。

## 数据接口

```typescript
type TacticalMap = {
  version: 1
  mapName: string
  bounds: { min: [number, number, number]; max: [number, number, number] }
  surfaces: Array<{
    kind: 'ground' | 'terrain' | 'wall'
    label: string
    positions: number[] // packed Source XYZ
    indices: number[]
    parts: Array<{ label: string; indexStart: number; indexCount: number }>
  }>
  sites: Array<{
    label: 'A' | 'B'
    position: [number, number, number]
    radius: number
    bounds: { min: number[]; max: number[] }
  }>
  source: Record<string, unknown>
}
```

`ground` 仅含原 NAV 与必要台阶；`terrain` 是非 NAV 支撑地形；`wall` 是真实截面低墙与屋顶证据建筑体块。`parts` 仅用于来源和检查，不增加绘制调用。

## 验证

```powershell
node tools/check-ancient-map.mjs
node tools/test-ancient-whitebox.mjs
node tools/check-ancient-map.mjs frontend/public/map/3d/de_ancient.json --replay '本地Ancient回合缓存.json'
```

结构检查包括预算、材质批次、索引坐标、零退化面、bounds、包点、NAV 面数及分区面积守恒。每条独立实体索引边恰好被两个面使用，每个连通实体只有平顶和平底两种 Z；实体可以接触，不能为检查而按坐标合并它们。

合成输入直接检查最终三角形，覆盖跨档斜墙、12 单位薄墙、192 单位高差的三维连接、斜面截面、开放单面、真实门洞、完整/开放墙建筑、无屋顶庭院和局部屋檐反例。

本机历史 Ancient 第 1 回合每 10 帧取样，共 881 个存活玩家点：768 点在原 NAV 投影内，881 点均有地面支撑；0 点进入重建墙体，全部可找到不高于脚底 16 单位的地面。垂直位置稳定的 734 点中，727 点距地面不超过 16 单位，比例 99.05%。

回归曾发现 85 个样本进入虚假墙体：开放物理面产生未配对出边，错误的非零 winding 把空气当实体；有限截面配对后归零。没有修改 Demo 坐标或扩大 NAV 挖墙绕过问题。

这是历史回合的抽样一致性检查，不代表全部 Demo 和所有位置完全还原。跳跃、NAV 净空及地图版本都会影响测量。
