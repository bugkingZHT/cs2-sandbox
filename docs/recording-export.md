# 录屏 MP4 兼容性

旧实现只传入 `video/mp4`。Chrome/Edge 可以选择 VP9 编码并输出分片 MP4；该组合是合法的 MP4，但部分桌面播放器、剪辑软件无法正确读取或定位进度。

现在先将捕获画面绘制到固定尺寸、每帧清为黑色的画布，再使用 `video/mp4;codecs=avc1` 录制。输出宽高对齐到 16 像素，最大为 1920 × 1088（1080p 加宏块对齐空间），最多 30 fps。录制过程中调整窗口大小，画面保持比例放入该画布，尺寸不足处填黑，不裁掉内容。这样避免直接把浏览器任意尺寸及变化的捕获缓冲交给编码器。

停止后，使用 Mediabunny 将完整录屏整理为 H.264、非分片、Fast Start MP4，写入时长和索引。已对齐的 H.264 数据直接复制，不重新压缩；未对齐的视频会按比例重新编码到对齐尺寸。浏览器只支持 WebM 录制时，通过浏览器原生 WebCodecs 转成 H.264。处理完全在本地进行，不上传视频，也不依赖 FFmpeg/WASM。

若浏览器不支持所需编码或封装失败，界面会提示失败，并保留带 `-original` 后缀和实际格式扩展名的原始录屏供下载。生成期间禁止开始下一次录制，避免会话间的数据混用。

## 验证

在 `frontend` 目录运行 `pnpm test:recording`。测试使用真实浏览器的标签页捕获和 MediaRecorder，检查导出文件的 H.264 编码、非分片封装、时长、下载、播放、前后跳转、连续录制、录制中改变窗口大小、WebM 兼容路径及启动失败后的捕获资源释放。对多个解码帧的底部 32 行检查异常绿色像素。

Windows 默认查找已安装的 Chrome/Edge；其他环境可以通过 `CS_TEST_BROWSER` 指定浏览器路径，或安装 Playwright Chromium。设置 `CS_RECORDING_TEST_OUTPUT` 可保存验证产物；`CS_TEST_WIDTH` / `CS_TEST_HEIGHT` 可测试任意捕获尺寸，例如 1906 × 912、961 × 641 和 2561 × 1441。

## 第三方组件

Mediabunny 1.56.2 使用 MPL-2.0，未修改其源代码。许可证及源码获取信息随应用打包于 `/third-party/`。

- [Mediabunny MP4 输出格式说明](https://mediabunny.dev/guide/output-formats)
- [MediaStream Recording 规范](https://www.w3.org/TR/mediastream-recording/)
