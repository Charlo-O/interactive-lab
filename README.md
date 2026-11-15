# Interactive Lab · 交互实验室

八个独立交互页面，一个 GitHub Pages 站点。只收录可维护源码、运行必需资源、构建配置与必要署名；不包含参考视频、成片、录屏、草稿、旧版本和原工程历史。

在线体验：[charlo.cn/interactive-lab](https://charlo.cn/interactive-lab/)

对应视频：[视频作品集](https://charlo.cn/video-library/)。各交互页面的影片按钮可直接打开对应项目视频。

| 页面 | 源码 | 地址后缀 |
| --- | --- | --- |
| 纸上涟漪 | projects/ripples | ripples/ |
| 手撕信封 | projects/letter | letter/ |
| 水猫 | projects/watercat | watercat/ |
| 古建筑构造图 | projects/architecture | architecture/ |
| 玻璃轮盘 | projects/glass-wheel | glass-wheel/ |
| 全年圆环 | projects/whole-circle | whole-circle/ |
| 抖动生物 | projects/dither-motion | dither-motion/ |
| 秋叶字体 | projects/autumn | autumn/ |

## 本地运行

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

打开 http://127.0.0.1:4173/interactive-lab/ 。`npm run preview` 只提供已有 dist 的预览。`PORT` 可改变端口。

```sh
npm run build
npm run check
npm run smoke
```

`check` 检查八个发布入口、目录结构与本地资源链接。`smoke` 在本机 Chrome 中检查关键交互、页面错误和资源加载；可通过 `CHROME_PATH` 指定浏览器，通过 `SMOKE_URL` 指定已部署站点，`SMOKE_OUT` 指定截图目录。浏览器检查的图片和报告默认写入系统临时目录。

## 构建与发布

- 默认路径 `/interactive-lab/`；可通过环境变量 `LAB_BASE_PATH` 改变，例如 `LAB_BASE_PATH=/ npm run build`。
- 原生静态项目保留各自源码结构。Astro 信封单独构建；水猫通过 esbuild 打包；抖动生物的视频封装依赖从本地 npm 包复制，不依赖运行时 CDN。
- `dist/`、依赖和缓存不提交。GitHub Actions 在 main 推送后执行 npm ci、构建、链接检查，再部署同一个 Pages 站点。
- 仓库 Settings → Pages 的 Source 使用 GitHub Actions。已有账号自定义域名时，项目站点可能继承该域名；以 Pages 返回的地址为准。本仓库不添加 CNAME。
- 每件作品各自运行，入口页不会预加载八个 Canvas 或 WebGL 场景。

## 内容与许可

运行资源仅保留实际被页面引用的内容。水猫的 reference.jpg 用于作品内“对比原图”功能；秋叶仅保留当前排版使用的叶片；抖动生物使用点数据而不收录提取前的原图；玻璃轮盘沿用原有内嵌背景。

古建筑是基于 FUJI 的 kigumi v8.9 的改编，保留原作者署名。第三方内容与音效详见 THIRD_PARTY_NOTICES.md。该集合没有统一授予新的开源许可证。
