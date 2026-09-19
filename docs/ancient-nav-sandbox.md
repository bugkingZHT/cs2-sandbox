# Ancient NAV 三维战术沙盘

> 历史实验，当前已恢复[原始去顶模型](ancient-3d.md)。以下数据仅对应 NAV 版本。

当前发布地图只从用户提供的 `de_ancient.nav` 玩家 hull 0 生成几何。原始 NAV 地面保留全部高度、坡度和三角形；其 XY 凸包内的空缺自动填为比附近地面高 24 世界单位的低矮体块。不再使用建筑外观、屋顶、碰撞模型或贴图。坐标保持 Demo XYZ，由前端统一映射到 Three 的 Y-up 空间。

浏览器只加载 `frontend/public/map/3d/de_ancient.json`，无需读取 NAV 或安装游戏。用户源文件保持不变。

## 当前资产

| 项目 | 数值 |
| --- | --- |
| JSON | 232,189 字节，约 227 KiB |
| 三角形 / 索引顶点 | 9,448 / 5,827 |
| 原始 NAV 地面 | 2,680 面，完整保留 |
| 低矮填块 | 33 个分区，封闭顶面、底面与侧面 |
| 墙高 / 基础下伸 | 24 / 8 世界单位 |
| 材质批次 | 2：ground、wall |
| 开口填块边 / 退化面 | 0 / 0 |
| Demo XYZ bounds | `[-2298,-2529.6,-177]` → `[1393.5,1769.4,255]` |

NAV SHA-256：`967c483c0e2e4471834a9e0ba80432c8e9a8114e61ff5a6fb08c32b7331fc6d4`。

上一版碰撞白模为 509,510 字节、20,625 面、96 单位低墙。本版资源和面数均减少约 54%。原有 A/B 标记作为固定地图注记保留；NAV 不包含包点触发器，注记不参与几何生成。

## 生成方式与限制

1. 固定 Source 2 Viewer CLI 20.0 只导出指定 NAV。每次重新提取，读取器验证转换矩阵，避免复用过期 GLB 或重复缩放。
2. 保留全部玩家 hull 0 三角形，精度 0.01 世界单位；重叠楼层不合并。
3. 合并 NAV 的 XY 投影，用其凸包减去精确 NAV 投影获得填块区域。不做栅格膨胀，不侵入窄路，不填满方形底座外围角落。
4. 填块边界顶点按最近 NAV 三角形或边插值得到地面高度，再抬高 24 单位；叠层边界取较低支撑。顶面在边界点之间三角化，底面下伸 8 单位，侧面封闭。不同地面高度不会被统一压平。
5. 点接触处拆分三角扇，保留布尔交点精度并去掉零面积三角形。实际填块与 NAV 投影相交面积小于 0.01 平方单位。约 725 万平方单位填块的三角化有约 13.44 平方单位微小轮廓面积误差（约 0.00019%），检查上限为 0.001%。
6. 合为两个材质批次，纯白灰色调，填块浅灰半透明；无新贴图或前端依赖。

NAV 描述可导航表面，不提供真实建筑边界或所有可站立点。空缺也可能是未覆盖的边缘、掩体顶部或庭院。因此填块只是空间示意，通过 `blocksShots: false` 排除在子弹射线之外；子弹仍与玩家和原始 NAV 地面做显示层碰撞。此模式不能重建真实墙体挡弹或穿墙效果。人物、投掷物始终按 Demo XYZ 运动，不吸附到填块上。

## 重建与验证

```powershell
# 默认模式只要求 NAV，无需 VPK。
pwsh -File tools/export-ancient-map.ps1 -Mode nav -Nav "$env:USERPROFILE/Desktop/de_ancient.nav"

# 已安装离线工具时直接运行。
node tools/export-nav-map.mjs --nav "$env:USERPROFILE/Desktop/de_ancient.nav"
node tools/check-nav-map.mjs
node tools/test-nav-sandbox.mjs
```

包装器下载并校验固定离线 CLI，安装离线几何依赖，不改变前端依赖。支持 `-WorkDirectory`、`-Output`；Node 支持 `--cli`、`--nav`、`--work`、`--earcut`、`--clipping`、`--out`。

测试覆盖窄通道、封顶、坡道、断开区域、重叠高度、NAV 不被修改、实际 Ancient 零地面侵入；浏览器验证旋转、缩放、平移、回放动画、二维回退和填块不参与子弹碰撞。

旧工具保留，可用 `-Mode collision` 生成碰撞版本，历史说明见 [ancient-collision-whitebox.md](ancient-collision-whitebox.md)。默认应用只发布一个 NAV 资源，不额外捆绑旧地图。
