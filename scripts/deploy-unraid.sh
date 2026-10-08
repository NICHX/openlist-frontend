#!/usr/bin/env bash
#
# 把本前端部署到 Unraid 上的 OpenList（同容器，不新增容器）。
#
# 原理：OpenList 用 config.json 的 dist_dir 指向一个目录来替换内置前端。
#       这里复用 OpenList 容器已有的 /opt/openlist/data 挂载，把产物放到
#       data/frontend，因此**不需要改动 Unraid 容器模板**（无需新增 Path）。
#
# 默认目标：ssh root@YOUR_UNRAID_IP / 容器 openlist /
#          appdata /mnt/user/appdata/openlist -> 容器 /opt/openlist/data
#          （config.json 位于 appdata 根目录，不在 data/ 下）
#
set -euo pipefail

# ------------------------------- 默认配置 -----------------------------------
HOST="${DEPLOY_HOST:-root@YOUR_UNRAID_IP}"
PORT="${DEPLOY_PORT:-5244}"
CONTAINER="${DEPLOY_CONTAINER:-}"                                     # 留空则自动探测
APPDATA="${DEPLOY_APPDATA:-/mnt/user/appdata/openlist}"               # 宿主机 appdata（= 容器 /opt/openlist/data）
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-$APPDATA/frontend}"                  # 宿主机上的产物目录
CONTAINER_DIR="${DEPLOY_CONTAINER_DIR:-/opt/openlist/data/frontend}"  # 容器内绝对路径（须与挂载一致）

# ------------------------------- 运行时变量 ---------------------------------
SKIP_BUILD=0
NO_RESTART=0
DRY_RUN=0
REVERT=0
TOGGLE=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$PROJECT_DIR/dist"

# ------------------------------- 输出工具 -----------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""
fi
step() { printf '%s==> %s%s\n' "$C_INFO" "$*" "$C_RESET"; }
ok()   { printf '%s  ✓ %s%s\n' "$C_OK" "$*" "$C_RESET"; }
warn() { printf '%s  ! %s%s\n' "$C_WARN" "$*" "$C_RESET" >&2; }
die()  { printf '%s  ✗ %s%s\n' "$C_ERR" "$*" "$C_RESET" >&2; exit 1; }

REMOTE_HOST="${HOST#*@}"

usage() {
  cat <<'USAGE'
把本前端部署到 Unraid 上的 OpenList（同容器，不新增容器）。

用法：
  scripts/deploy-unraid.sh [选项]

选项：
  --host <user@ip>        目标主机（默认 root@YOUR_UNRAID_IP，可通过 DEPLOY_HOST 环境变量覆盖）
  --port <端口>           OpenList 端口（默认 5244）
  --container <名称>      OpenList 容器名（默认自动探测）
  --appdata <路径>        宿主机 appdata（默认 /mnt/user/appdata/openlist）
  --remote-dir <路径>     宿主机产物目录（默认 <appdata>/frontend）
  --container-dir <路径>  容器内产物目录（默认 /opt/openlist/data/frontend）
  --skip-build            跳过构建，直接上传现有 dist/
  --no-restart            只改配置不重启容器
  --dry-run               只打印动作，读取操作照常执行
  --toggle                一键切换：官方内置前端 ↔ 自定义前端（改 dist_dir 并重启）
  --revert                回滚：清空 dist_dir 并重启（恢复官方前端）
  -h, --help              显示本帮助
USAGE
}

# ------------------------------- 参数解析 -----------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; REMOTE_HOST="${HOST#*@}"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    --appdata) APPDATA="$2"; REMOTE_DIR="$APPDATA/frontend"; shift 2 ;;
    --remote-dir) REMOTE_DIR="$2"; shift 2 ;;
    --container-dir) CONTAINER_DIR="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --no-restart) NO_RESTART=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --toggle) TOGGLE=1; shift ;;
    --revert) REVERT=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数：$1（用 --help 查看用法）" ;;
  esac
done

CONFIG="$APPDATA/config.json"

# 只读：始终执行（dry-run 也需要它来探测环境）
ssh_read() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "$@"; }
# 写操作：dry-run 时只打印
ssh_write() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] ssh %s %q\n' "$HOST" "$*"
    return 0
  fi
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" "$@"
}

site_probe() {
  local out="$1" scheme code
  for scheme in https http; do
    code="$(curl -s -m 3 -k -o "$out" -w '%{http_code}' "$scheme://$REMOTE_HOST:$PORT/" || true)"
    if [ "$code" = "200" ]; then printf '%s' "$scheme"; return 0; fi
  done
  printf '%s' ""
  return 1
}

# ============================================================================
# 回滚模式
# ============================================================================
if [ "$REVERT" = 1 ]; then
  step "回滚：把 dist_dir 置空并重启（恢复 OpenList 官方前端）"
  ssh_read "command -v jq >/dev/null 2>&1" || die "远端缺少 jq，无法安全修改 JSON"
  ssh_write "ts=\$(date +%Y%m%d-%H%M%S); cp '$CONFIG' \"$CONFIG.bak.revert.\$ts\"; \
             jq '.dist_dir=\"\"' '$CONFIG' > '$CONFIG.tmp' && mv '$CONFIG.tmp' '$CONFIG'"
  ssh_read "jq -r '(\"dist_dir=\" + (.dist_dir // \"(空)\"))' '$CONFIG'"
  if [ "$NO_RESTART" = 0 ]; then
    [ -n "$CONTAINER" ] || CONTAINER="$(ssh_read "docker ps --format '{{.Names}}|{{.Image}}' | grep -i openlist | head -1 | cut -d'|' -f1" || true)"
    [ -n "$CONTAINER" ] || die "未找到 OpenList 容器，请用 --container 指定"
    step "重启容器 $CONTAINER"
    ssh_write "docker restart '$CONTAINER' >/dev/null"
  fi
  ok "已回滚（浏览器硬刷新即可）"
  exit 0
fi

# ============================================================================
# 一键切换：官方内置前端 ↔ 自定义前端
# ============================================================================
if [ "$TOGGLE" = 1 ]; then
  step "一键切换前端（官方内置 ↔ 自定义）"
  ssh_read "test -f '$CONFIG'" || die "找不到 $CONFIG"
  ssh_read "command -v jq >/dev/null 2>&1" || die "远端缺少 jq，无法安全修改 JSON"

  CURRENT="$(ssh_read "jq -r '.dist_dir // \"\"' '$CONFIG'")"
  if [ "$CURRENT" = "$CONTAINER_DIR" ]; then
    TARGET=""
    LABEL="官方内置前端"
  else
    TARGET="$CONTAINER_DIR"
    LABEL="自定义前端"
    ssh_read "test -f '$REMOTE_DIR/index.html'" || die "自定义产物不存在（$REMOTE_DIR/index.html），请先正常运行一次部署"
  fi

  if [ "$CURRENT" = "$TARGET" ]; then
    warn "dist_dir 已是 ${TARGET:-（空）}，无需切换"
  else
    ssh_write "ts=\$(date +%Y%m%d-%H%M%S); cp '$CONFIG' \"$CONFIG.bak.\$ts\""
    ssh_write "jq --arg d '$TARGET' '.dist_dir=\$d' '$CONFIG' > '$CONFIG.tmp' && mv '$CONFIG.tmp' '$CONFIG'"
    ok "dist_dir: ${CURRENT:-（空）} -> ${TARGET:-（空）}"
  fi

  CDN="$(ssh_read "jq -r '.cdn // \"\"' '$CONFIG'")"
  if [ "$TARGET" = "$CONTAINER_DIR" ] && [ -n "$CDN" ]; then
    warn "config.json 的 cdn 非空（${CDN}）：会把 /assets/ 302 到 CDN 导致自定义资源 404，请先置空"
  fi

  if [ "$NO_RESTART" = 1 ]; then
    warn "已指定 --no-restart：请自行重启容器使配置生效"
  else
    [ -n "$CONTAINER" ] || CONTAINER="$(ssh_read "docker ps --format '{{.Names}}|{{.Image}}' | grep -i openlist | head -1 | cut -d'|' -f1" || true)"
    [ -n "$CONTAINER" ] || die "未找到 OpenList 容器，请用 --container 指定"
    step "重启容器 ${CONTAINER}（index.html 在启动时读取，必须重启）"
    ssh_write "docker restart '$CONTAINER' >/dev/null" && ok "已重启"

    if [ "$DRY_RUN" = 0 ]; then
      SCHEME=""
      for _ in $(seq 1 40); do
        SCHEME="$(site_probe /tmp/openlist-switch-check.html || true)"
        [ -n "$SCHEME" ] && break
        sleep 1
      done
      if [ -n "$SCHEME" ]; then ok "站点返回 200（${SCHEME}）"; else warn "等待 https/http://$REMOTE_HOST:$PORT/ 超时"; fi
    fi
  fi

  ok "已切换到：${LABEL}（浏览器强制刷新 Cmd/Ctrl+Shift+R）"
  printf '  当前前端：%s://%s:%s/  ->  dist_dir=%s\n\n' "${SCHEME:-https}" "$REMOTE_HOST" "$PORT" "${TARGET:-（空=官方内置）}"
  exit 0
fi

# ============================================================================
# 1/6 构建
# ============================================================================
step "1/6 构建前端"
if [ "$SKIP_BUILD" = 1 ]; then
  [ -f "$DIST_DIR/index.html" ] || die "--skip-build 但 $DIST_DIR/index.html 不存在"
  ok "跳过构建，使用现有 dist/"
elif [ "$DRY_RUN" = 1 ]; then
  printf '    [dry-run] (cd %s && npm run build)\n' "$PROJECT_DIR"
else
  ( cd "$PROJECT_DIR" && npm run build )
  ok "构建完成"
fi
# 入口 chunk 形如 index-<hash>.js；按需分包（如 AdminLayout-<hash>.js）也会出现在同一目录，
# 因此必须精确匹配 index- 前缀，否则校验会误报。
ASSET_JSON="$(ls "$DIST_DIR/assets" 2>/dev/null | grep -E '^index-.*\.js$' | head -1 || true)"
[ -n "$ASSET_JSON" ] || ASSET_JSON="$(ls "$DIST_DIR/assets" 2>/dev/null | grep '\.js$' | head -1 || true)"
if [ "$DRY_RUN" = 0 ]; then
  [ -f "$DIST_DIR/index.html" ] || die "dist/index.html 不存在"
  [ -n "$ASSET_JSON" ] || die "dist/assets 下没有 js 产物，构建可能失败"
  ok "产物：index.html + assets/（$(du -sh "$DIST_DIR" | cut -f1)）"
fi

# ============================================================================
# 2/6 连通性与环境
# ============================================================================
step "2/6 检查免密 SSH 与远端环境"
ssh_read "true" >/dev/null 2>&1 || die "无法免密 SSH 到 $HOST"
ok "SSH 可达：$HOST"

if [ -z "$CONTAINER" ]; then
  CONTAINER="$(ssh_read "docker ps --format '{{.Names}}|{{.Image}}' | grep -i openlist | head -1 | cut -d'|' -f1" || true)"
fi
[ -n "$CONTAINER" ] || die "未找到 OpenList 容器，请用 --container 指定名称"
ssh_read "docker inspect '$CONTAINER' >/dev/null 2>&1" || die "容器 '$CONTAINER' 不存在"
ok "目标容器：$CONTAINER"

ssh_read "command -v jq >/dev/null 2>&1"   || die "远端缺少 jq，无法安全修改 config.json"
ssh_read "command -v rsync >/dev/null 2>&1" || die "远端缺少 rsync"
ok "远端具备 jq / rsync"

MOUNTS="$(ssh_read "docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' '$CONTAINER'")"
case "$CONTAINER_DIR" in
  /opt/openlist/data/*)
    case "$MOUNTS" in
      *"/opt/openlist/data "*) ok "复用已有挂载 /opt/openlist/data（无需改容器模板）" ;;
      *) die "容器未挂载 /opt/openlist/data，请检查容器配置" ;;
    esac ;;
  *) warn "dist_dir=$CONTAINER_DIR 不在 /opt/openlist/data 内，请确认它确实是容器挂载点" ;;
esac

# ============================================================================
# 3/6 上传
# ============================================================================
step "3/6 上传产物到 $HOST:$REMOTE_DIR"
ssh_write "mkdir -p '$REMOTE_DIR'"
if [ "$DRY_RUN" = 1 ]; then
  printf '    [dry-run] rsync -az --delete %s/ %s:%s/\n' "$DIST_DIR" "$HOST" "$REMOTE_DIR"
else
  rsync -az --delete "$DIST_DIR/" "$HOST:$REMOTE_DIR/"
  ssh_read "test -f '$REMOTE_DIR/index.html'" || die "上传后远端缺少 index.html"
  ok "已上传 $(ssh_read "find '$REMOTE_DIR' -type f | wc -l | tr -d ' '") 个文件"
fi

# ============================================================================
# 4/6 写配置
# ============================================================================
step "4/6 设置 config.json 的 dist_dir = $CONTAINER_DIR"
ssh_read "test -f '$CONFIG'" || die "找不到 $CONFIG"
CURRENT="$(ssh_read "jq -r '.dist_dir // \"\"' '$CONFIG'")"
if [ "$CURRENT" = "$CONTAINER_DIR" ]; then
  ok "dist_dir 已是目标值，跳过写入"
else
  ssh_write "ts=\$(date +%Y%m%d-%H%M%S); cp '$CONFIG' \"$CONFIG.bak.\$ts\""
  ssh_write "jq --arg d '$CONTAINER_DIR' '.dist_dir=\$d' '$CONFIG' > '$CONFIG.tmp' && mv '$CONFIG.tmp' '$CONFIG'"
  ok "dist_dir: ${CURRENT:-（空）} -> ${CONTAINER_DIR}（已备份原文件）"
fi

CDN="$(ssh_read "jq -r '.cdn // \"\"' '$CONFIG'")"
if [ -n "$CDN" ]; then
  warn "config.json 的 cdn 非空（${CDN}）：OpenList 会把 /assets/ 等静态路由 302 到 CDN，"
  warn "  导致本前端资源 404。请把 cdn 置为空字符串后重启。"
fi

# ============================================================================
# 5/6 重启
# ============================================================================
if [ "$NO_RESTART" = 1 ]; then
  warn "已指定 --no-restart：请自行重启容器使配置生效"
else
  step "5/6 重启容器 $CONTAINER"
  ssh_write "docker restart '$CONTAINER' >/dev/null" && ok "已重启"
fi

# ============================================================================
# 6/6 校验
# ============================================================================
if [ "$DRY_RUN" = 1 ] || [ "$NO_RESTART" = 1 ]; then
  step "6/6 跳过在线校验"
  exit 0
fi

step "6/6 校验服务"
SCHEME=""
for _ in $(seq 1 40); do
  SCHEME="$(site_probe /tmp/openlist-deploy-check.html || true)"
  [ -n "$SCHEME" ] && break
  sleep 1
done
[ -n "$SCHEME" ] || die "等待 https/http://$REMOTE_HOST:$PORT/ 超时（未拿到 200）"
ok "站点返回 200（${SCHEME}）"

if grep -q "$ASSET_JSON" /tmp/openlist-deploy-check.html; then
  ok "首页已引用本前端产物（${ASSET_JSON}）"
else
  warn "首页未引用本次产物：可能是缓存，或 dist_dir 未生效"
fi

LOG_LINE="$(ssh_read "docker logs --tail 300 '$CONTAINER' 2>&1 | grep -i 'custom dist directory' | tail -1" || true)"
# 该日志按配置写入文件（stdout 可能被过滤），因此再查一次日志文件
if [ -z "$LOG_LINE" ]; then
  LOG_LINE="$(ssh_read "grep -i 'custom dist directory' '$APPDATA/log/log.log' 2>/dev/null | tail -1" || true)"
fi
if [ -n "$LOG_LINE" ]; then ok "OpenList 日志：$LOG_LINE"; else warn "日志中未见 'custom dist directory'，请检查容器日志"; fi

printf '\n%s部署完成%s\n' "$C_OK" "$C_RESET"
printf '  前端地址：%s://%s:%s/\n' "${SCHEME:-https}" "$REMOTE_HOST" "$PORT"
printf '  产物目录：%s:%s  ->  容器 %s\n' "$HOST" "$REMOTE_DIR" "$CONTAINER_DIR"
printf '  配置备份：%s.bak.<时间戳>\n\n' "$CONFIG"
printf '回滚：%s --revert\n' "$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
printf '提示：首次访问建议强制刷新（Cmd/Ctrl+Shift+R），避开旧 index.html 缓存。\n'
