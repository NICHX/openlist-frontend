# OpenList 现代文件管理前端

一个可替换 OpenList 官方前端的**纯静态**文件管理器前端。后端能力（云盘对接、上传协议、WebDAV、鉴权等）**全部复用现有 OpenList HTTP API**，本项目不包含任何后端代码，也不修改 OpenList 源码。

- 技术栈：React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · Radix/shadcn 风格组件 · TanStack Query · TanStack Virtual · Zustand · lucide-react
- 交互与视觉沿用已定稿原型：Flat / 内容优先、浅色 + 深色两套、蓝=文件夹 / 琥珀=文件、Plus Jakarta Sans + 等宽数字、统一线性图标。

---

## 快速开始（本地开发）

需要 Node.js ≥ 18。开发时通过 Vite 代理把 `/api`、`/d`、`/p` 转发到正在运行的 OpenList，因此**无需改动后端 CORS**。

```bash
npm install
# 可选：指向你的 OpenList（默认 http://localhost:5244）
cp .env.example .env
npm run dev
```

打开 http://localhost:5173 。

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（代理到 `VITE_PROXY_TARGET`） |
| `npm run build` | 类型检查 + 生产构建，产物在 `dist/` |
| `npm run typecheck` | 仅做类型检查 |
| `npm run preview` | 本地预览构建产物 |

---

## 部署方式一（推荐）：与 OpenList 同容器，覆盖内置前端

不提额外容器、不改后端代码：把构建产物放进 OpenList 容器内，用 `config.json` 的 `dist_dir` 指向它。

### 通用 Docker

1. 构建产物：

   ```bash
   npm ci && npm run build   # 产物在 dist/
   ```

2. 把 `dist/` 放到宿主机，例如 `/opt/openlist/frontend`。

3. 给容器再加一个只读挂载：

   ```yaml
   volumes:
     - /opt/openlist/data:/opt/openlist/data
     - /opt/openlist/frontend:/opt/openlist/frontend:ro
   ```

4. 编辑宿主机上的 `<appdata>/data/config.json`，设置：

   ```json
   { "dist_dir": "/opt/openlist/frontend" }
   ```

5. 重启容器，访问 `http://<host>:5244/`。

### Unraid（已实测：`openlist` 容器 / v4.2.6）

Unraid 的 OpenList 容器已把 `/mnt/user/appdata/openlist` 挂到 `/opt/openlist/data`。
把产物放进这个**已存在的挂载**里即可，**无需改动容器模板**。

推荐用脚本一键完成（构建 → 上传 → 改 `dist_dir` → 重启 → 校验）：

```bash
scripts/deploy-unraid.sh            # 默认 root@YOUR_UNRAID_IP / 容器 openlist（用 --host 或 DEPLOY_HOST 指定）
scripts/deploy-unraid.sh --dry-run  # 先看会做什么
scripts/deploy-unraid.sh --revert   # 回滚（清空 dist_dir 并重启，恢复官方前端）
```

手工等价步骤：

1. 上传产物到 `/mnt/user/appdata/openlist/frontend`。
2. 编辑 `/mnt/user/appdata/openlist/config.json`（注意：`config.json` 在 appdata **根目录**，不在 `data/` 下），把 `dist_dir` 设为**容器内**路径：

   ```json
   { "dist_dir": "/opt/openlist/data/frontend" }
   ```

3. `docker restart openlist`。
4. 首次访问强制刷新（Cmd/Ctrl+Shift+R）。

> 如果你更希望把前端放在 appdata 之外（例如 `/mnt/user/appdata/openlist-web`），
> 那才需要在容器模板里额外加一条 Path 映射（`/opt/openlist/frontend`，Read Only），
> 并把 `dist_dir` 指向它 —— 用 `scripts/deploy-unraid.sh --container-dir /opt/openlist/frontend --remote-dir /mnt/user/appdata/openlist-web`。

### 已验证要点（OpenList v4.2.6 实测）

- `dist_dir` 必须是**容器内的绝对路径**，且该目录必须包含 `index.html`，否则 OpenList 启动即失败并报 `index.html not exist`。
- 请同时保持 `cdn` 为**空**。`cdn` 非空时 `/assets/` 等静态路由会被 302 重定向到 CDN，自定义前端资源将 404。
- 前端路由可刷新/深链：OpenList 的 catch-all 会把非 `/api` 的 GET 回退到 `index.html`（实测 `/files` 返回 index.html，且与 `/` 内容一致）。
- 本前端只需 `assets/` + `index.html`。官方前端额外的 `images/`、`streamer/`、`static/` 目录**缺失不会导致崩溃**（已实测），这几个路径无内容，本前端不使用。
- 改完 `config.json` **必须重启**（`index.html` 在启动时读入内存）；更新前端时替换挂载目录内的文件再重启即可，资源文件名带哈希，无旧缓存冲突。
- ⚠️ **环境变量无法覆盖** `config.json` 的取值：实测 `OPENLIST_DIST_DIR`、`OPENLIST_SCHEME_HTTP_PORT` 均不生效，请直接修改 `config.json`。


---

## 部署方式二：独立站点 / 容器

若前端与 OpenList 不同源，需要在 OpenList 的 `config.json` 中放开 CORS：

```json
{
  "cors": {
    "allow_origins": ["https://your-frontend.example.com"],
    "allow_methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "allow_headers": ["*"]
  }
}
```

然后把 `dist/` 用任意静态服务器（Nginx / Caddy / 对象存储）托管，并将前端的 `/api`、`/d`、`/p` 反向代理到 OpenList（推荐），或改为直连 OpenList 域名。

---

## 与 OpenList API 的对接说明

集中封装在 `src/api/`，全部类型集中在 `src/api/types.ts`。

- 登录：`POST /api/auth/login`（`{username, password}` → `data.token`）；另有 `/api/auth/login/hash` 作为兜底。
- 鉴权：所有请求携带 `Authorization: <token>`。**注意：不能加 `Bearer ` 前缀**，OpenList 中间件按原值直接比对（见 `src/api/client.ts`）。
- 站点信息：`GET /api/public/settings`（无需登录）。
- 统一响应 `{ code, message, data }`，`code === 200` 才算成功；客户端把网络错误也归一化成同一信封，调用方只判断 `code`。
- 401 自动跳登录：`src/api/client.ts` 派发 `openlist:unauthorized` 事件，`src/App.tsx` 清除会话并跳转 `/login`。

使用到的接口（方法以 OpenList 路由为准）：

| 功能 | 接口 |
| --- | --- |
| 列目录 | `POST /api/fs/list` |
| 详情 / 直链 | `POST /api/fs/get` |
| 目录树 | `POST /api/fs/dirs` |
| 新建文件夹 | `POST /api/fs/mkdir` |
| 重命名 | `POST /api/fs/rename` |
| 移动 / 复制 | `POST /api/fs/move` · `POST /api/fs/copy` |
| 删除 | `POST /api/fs/remove` |
| 搜索 | `POST /api/fs/search` |
| 离线下载 | `POST /api/fs/add_offline_download` |

上传（`src/features/upload/`）：

- 小文件：流式 `PUT /api/fs/put`（`File-Path` 需 URL 编码），`onUploadProgress` 驱动实时进度与速度。
- 大文件（> 8MB）：可续传分片 `POST /api/fs/multipart/init` → `PUT /api/fs/multipart/chunk`（并发 3 分片 + 失败退避重试）→ `POST /api/fs/multipart/complete`，并以 `GET /api/fs/multipart/status` 断点续传与轮询落盘；后端返回 `data: null` 时自动回退到流式上传。
- 秒传：可选开启「哈希」，计算 MD5/SHA-1/SHA-256，通过 `X-File-Md5/Sha1/Sha256` 头触发存储端的快速上传。
- 支持拖拽多个文件与整个文件夹（`webkitGetAsEntry` 递归保留目录结构），以及 `webkitdirectory` 选择文件夹。
- 传输队列支持并发、进度、速度、失败重试（含一键重试全部失败项）与取消。

---

## 功能一览

- **导航**：常驻侧栏（最近访问 / 全部文件 / 收藏 / 我的分享 / 回收站 + 云盘列表带容量条）；可点击面包屑；列表 ↔ 网格切换；键盘操作（方向键 / Enter / Space / Ctrl+A / Esc）。
- **浏览**：分页与排序（名称 / 大小 / 时间）、类型筛选、加载骨架屏、空状态引导、> 200 项自动虚拟滚动、受保护目录密码输入。
- **操作**：多选与批量（下载 / 复制链接 / 移动 / 删除）、新建文件夹、重命名、移动、删除、下载、复制直链。
- **预览**：图片 / 视频 / 音频 / 文本 / PDF。
- **移动端**：底部导航 + 悬浮上传按钮；触控目标 ≥ 44px；375px 宽度无横向滚动；抽屉式侧栏。
- **管理后台**（仅管理员可见；入口在侧栏底部「管理」分组 + 「我的」页面；路由 `/admin`）：
  采用独立的**单侧栏布局**（不再与文件管理器侧栏叠加），导航按用途分组，代码按需加载为独立分包，
  字段名与驱动参数使用**官方发布包内的 zh-CN 词条**（`dist/i18n.tar.gz`），不再显示英文 key。分区：
  概览 / 存储（增删改、启用禁用、重新加载、按驱动动态渲染专属表单）/ 用户（角色 + 16 项权限位、取消 2FA、清缓存）/
  元信息 / 分享 / 设置（12 个分组、按类型渲染控件、仅提交改动项、加载默认值）/ 任务（7 类，取消/重试/删除/清理）/
  索引（构建/更新/停止/清除 + 实时进度）/ 插件 / 消息推送 / 备份与恢复 / 个人资料与安全（改密、2FA、SSH 公钥、WebAuthn）/ 关于。
  S3 相关配置在「设置 → S3」分组内。
- **主题**：浅色 / 深色，语义色令牌化；两套主题均满足正文对比度 ≥ 4.5:1（已实测）。

## 已知限制

- **管理后台**：设置 `dist_dir` 会**同时替换官方的 `/@manage`**（OpenList 用同一份 `index.html` 渲染管理页，无法只替换文件浏览页）。因此本项目在 `/admin` 自建了管理后台（13 个分区）。其中：**插件**与**消息推送**依赖服务端版本是否提供对应接口，若服务端未启用会显示服务端返回的原因；**备份与恢复**是前端侧的导出/导入（不存在官方数据库级备份接口），导入仅自动回写「设置」与「存储」，用户/元信息/分享需手动处理；**个人资料与安全**的 WebAuthn 注册在浏览器不支持 `parseCreationOptionsFromJSON` 时会禁用并提示。
- **界面语言**：目前仅中文（词条取自官方发布包的 zh-CN），未做多语言切换。
- **分享**：可创建/管理分享记录并复制 `/sd/<id>` 直链（服务端可下载）；本项目不含官方 `/<id>` 的分享浏览页。
- **回收站**：OpenList 默认无统一回收站，删除即时生效；侧栏「回收站」为说明性入口。
- **秒传**：是否生效取决于所挂载的存储驱动是否支持哈希快速上传。

## 目录结构

```
src/
  api/          OpenList 客户端、类型与接口封装
  components/
    layout/     AppShell：侧栏 / 顶栏 / 面包屑 / 移动端导航
    ui/         shadcn 风格基础组件
  features/
    auth/       登录
    browse/     文件浏览（列表 / 网格 / 工具栏 / 虚拟滚动）
    ops/        新建 / 重命名 / 移动 / 删除
    upload/     上传引擎与传输队列
    preview/    在线预览
    search/     搜索
    quick/      收藏 / 最近 / 账号等
  lib/          工具（格式化、路径、类型识别、哈希、下载）
  stores/       会话 / 站点设置 / 偏好 / 上传 / 主题
  theme         令牌在 src/index.css（:root 与 .dark）
```
