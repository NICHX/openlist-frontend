import { r } from "./client"
import type {
  AdminMeta,
  AdminShare,
  AdminStorage,
  AdminUser,
  CurrentUser,
  DirectoryNode,
  DriverInfo,
  Drivers,
  FsGetData,
  FsListData,
  ListParams,
  LoginResult,
  Obj,
  PageResp,
  PublicSettings,
  Resp,
  SearchNode,
  SearchParams,
  SettingItem,
  TaskInfo,
  TaskTypeKey,
} from "./types"

/* ---------------------------- 个人资料 / 安全 ---------------------------- */

/**
 * `POST /api/auth/2fa/generate` 的响应：`qr` 为 PNG data URL，
 * 兼容旧构建的 `qrcode` 字段；`secret` 用于手动添加。
 */
export interface TwoFAGenerateResp {
  qr?: string
  qrcode?: string
  secret: string
}

/** `GET /api/me/sshkey/list` 的行。 */
export interface SSHPublicKey {
  id: number | string
  title: string
  fingerprint: string
  added_time?: string
  last_used_time?: string
}

/** `GET /api/authn/getcredentials` 的行（id 为凭证 id 的 base64）。 */
export interface AuthnCredential {
  id: string
  fingerprint: string
}

/** `GET /api/authn/webauthn_begin_registration` 的响应。 */
export interface AuthnRegistrationResp {
  session: string
  options: { publicKey: unknown }
}

/* ------------------------------- auth ---------------------------------- */

export const authApi = {
  /** Plaintext login (POST /api/auth/login) — the documented default. */
  login: (username: string, password: string, otpCode = ""): Promise<Resp<LoginResult>> =>
    r.post("/auth/login", { username, password, otp_code: otpCode }),

  /** SHA-256 login variant (POST /api/auth/login/hash); password pre-hashed. */
  loginHash: (username: string, hashed: string, otpCode = ""): Promise<Resp<LoginResult>> =>
    r.post("/auth/login/hash", { username, password: hashed, otp_code: otpCode }),

  /** GET /api/auth/logout */
  logout: (): Promise<Resp<null>> => r.get("/auth/logout"),

  /** GET /api/me — current session identity (also validates the token). */
  me: (): Promise<Resp<CurrentUser>> => r.get("/me"),

  /** POST /api/me/update — 更新自己的用户名/密码；`password` 为空表示不修改。 */
  updateMe: (body: { username: string; password: string; sso_id: string }): Promise<Resp<null>> =>
    r.post("/me/update", body),

  /** POST /api/auth/2fa/generate — 生成 TOTP 密钥与二维码。 */
  generate2fa: (): Promise<Resp<TwoFAGenerateResp>> => r.post("/auth/2fa/generate"),

  /** POST /api/auth/2fa/verify — 用 6 位验证码确认并启用。 */
  verify2fa: (code: string, secret: string): Promise<Resp<null>> =>
    r.post("/auth/2fa/verify", { code, secret }),

  /** GET /api/me/sshkey/list */
  sshKeyList: (): Promise<PageResp<SSHPublicKey>> => r.get("/me/sshkey/list"),

  /** POST /api/me/sshkey/add */
  sshKeyAdd: (title: string, key: string): Promise<Resp<null>> =>
    r.post("/me/sshkey/add", { title, key }),

  /** POST /api/me/sshkey/delete?id= */
  sshKeyDelete: (id: number | string): Promise<Resp<null>> =>
    r.post(`/me/sshkey/delete?id=${encodeURIComponent(String(id))}`),

  /** GET /api/authn/getcredentials */
  authnCredentials: (): Promise<Resp<AuthnCredential[]>> => r.get("/authn/getcredentials"),

  /** POST /api/authn/delete_authn */
  authnDelete: (id: string): Promise<Resp<null>> => r.post("/authn/delete_authn", { id }),

  /** GET /api/authn/webauthn_begin_registration */
  authnBeginRegistration: (): Promise<Resp<AuthnRegistrationResp>> =>
    r.get("/authn/webauthn_begin_registration"),

  /** POST /api/authn/webauthn_finish_registration — 凭证 JSON + `session` 请求头。 */
  authnFinishRegistration: (session: string, credential: unknown): Promise<Resp<unknown>> =>
    r.post("/authn/webauthn_finish_registration", credential, { headers: { session } }),
}

/* ------------------------------ public --------------------------------- */

export const publicApi = {
  /** GET /api/public/settings — no auth required. */
  settings: (): Promise<Resp<PublicSettings>> => r.get("/public/settings"),
}

/* -------------------------------- fs ----------------------------------- */

export const fsApi = {
  /** POST /api/fs/list */
  list: (params: ListParams, signal?: AbortSignal): Promise<Resp<FsListData>> =>
    r.post(
      "/fs/list",
      {
        path: params.path,
        password: params.password ?? "",
        page: params.page ?? 1,
        per_page: params.per_page ?? 0,
        refresh: params.refresh ?? false,
        order_by: params.order_by ?? "",
        order_direction: params.order_direction ?? "",
      },
      { signal },
    ),

  /** POST /api/fs/get — file detail + download direct link (`raw_url`). */
  get: (path: string, password = ""): Promise<Resp<FsGetData>> =>
    r.post("/fs/get", { path, password }),

  /** POST /api/fs/dirs — directory tree used by the "move to" picker. */
  dirs: (path = "/", password = "", forceRoot = false): Promise<Resp<DirectoryNode[]>> =>
    r.post("/fs/dirs", { path, password, force_root: forceRoot }),

  /** POST /api/fs/mkdir */
  mkdir: (path: string): Promise<Resp<null>> => r.post("/fs/mkdir", { path }),

  /** POST /api/fs/rename */
  rename: (path: string, name: string, overwrite = false): Promise<Resp<null>> =>
    r.post("/fs/rename", { path, name, overwrite }),

  /** POST /api/fs/move */
  move: (
    srcDir: string,
    dstDir: string,
    names: string[],
    overwrite = false,
    skipExisting = false,
  ): Promise<Resp<null>> =>
    r.post("/fs/move", {
      src_dir: srcDir,
      dst_dir: dstDir,
      names,
      overwrite,
      skip_existing: skipExisting,
    }),

  /** POST /api/fs/copy */
  copy: (
    srcDir: string,
    dstDir: string,
    names: string[],
    overwrite = false,
    skipExisting = false,
    merge = false,
  ): Promise<Resp<null>> =>
    r.post("/fs/copy", {
      src_dir: srcDir,
      dst_dir: dstDir,
      names,
      overwrite,
      skip_existing: skipExisting,
      merge,
    }),

  /** POST /api/fs/remove */
  remove: (dir: string, names: string[]): Promise<Resp<null>> =>
    r.post("/fs/remove", { dir, names }),

  /** POST /api/fs/search */
  search: (params: SearchParams, signal?: AbortSignal): Promise<PageResp<SearchNode>> =>
    r.post(
      "/fs/search",
      {
        parent: params.parent,
        keywords: params.keywords,
        scope: params.scope ?? 0,
        page: params.page ?? 1,
        per_page: params.per_page ?? 100,
        password: params.password ?? "",
      },
      { signal },
    ),

  /** POST /api/fs/add_offline_download */
  addOfflineDownload: (
    path: string,
    urls: string[],
    tool = "aria2",
    deletePolicy = "delete_on_upload_succeed",
  ): Promise<Resp<null>> =>
    r.post("/fs/add_offline_download", { path, urls, tool, delete_policy: deletePolicy }),

  /**
   * Streaming upload — PUT /api/fs/put with a URL-encoded `File-Path` header.
   * `onProgress` reports bytes so callers can compute speed / progress.
   */
  put: (
    file: File | Blob,
    uploadPath: string,
    options: {
      overwrite?: boolean
      asTask?: boolean
      password?: string
      lastModified?: number
      contentType?: string
      hashes?: { md5?: string; sha1?: string; sha256?: string }
      onProgress?: (loaded: number, total: number) => void
      signal?: AbortSignal
    } = {},
  ): Promise<Resp<null>> => {
    const headers: Record<string, string> = {
      // The server URL-decodes this header, so always encode it.
      "File-Path": encodeURIComponent(uploadPath),
      "Content-Type": options.contentType || (file as File).type || "application/octet-stream",
      Password: options.password ?? "",
      Overwrite: String(options.overwrite ?? false),
      "As-Task": String(options.asTask ?? false),
    }
    if (options.lastModified) headers["Last-Modified"] = String(options.lastModified)
    if (options.hashes?.md5) headers["X-File-Md5"] = options.hashes.md5
    if (options.hashes?.sha1) headers["X-File-Sha1"] = options.hashes.sha1
    if (options.hashes?.sha256) headers["X-File-Sha256"] = options.hashes.sha256

    return r.put("/fs/put", file, {
      headers,
      signal: options.signal,
      onUploadProgress: (e) => {
        if (e.total && options.onProgress) options.onProgress(e.loaded, e.total)
      },
    }) as unknown as Promise<Resp<null>>
  },
}

/* ---------------------------- multipart --------------------------------- */
/* Resumable chunked upload protocol (Go backend).
   POST /fs/multipart/init -> PUT /fs/multipart/chunk -> POST /fs/multipart/complete
   with GET /fs/multipart/status for resume/observability. */

export type MultipartState =
  | "receiving"
  | "completed"
  | "failed_retriable"
  | "failed_permanent"
  | "aborted"

export interface MultipartSnapshot {
  upload_id: string
  state: MultipartState
  attempt: number
  path: string
  size: number
  chunk_size: number
  total_chunks: number
  /** Inclusive [lo, hi] index ranges already persisted server-side. */
  received: [number, number][]
  received_bytes: number
  frontier: number
  storage_progress: number
  error?: string
}

export const multipartApi = {
  init: (
    uploadPath: string,
    file: File,
    chunkSize: number,
    options: {
      overwrite?: boolean
      password?: string
      hashes?: { md5?: string; sha1?: string; sha256?: string }
    } = {},
  ): Promise<Resp<MultipartSnapshot & { resumed: boolean }>> => {
    const headers: Record<string, string> = {
      "File-Path": encodeURIComponent(uploadPath),
      "X-File-Size": String(file.size),
      "X-Chunk-Size": String(chunkSize),
      "Content-Type": file.type || "application/octet-stream",
      "Last-Modified": String(file.lastModified),
      Password: options.password ?? "",
      Overwrite: String(options.overwrite ?? false),
    }
    if (options.hashes?.md5) headers["X-File-Md5"] = options.hashes.md5
    if (options.hashes?.sha1) headers["X-File-Sha1"] = options.hashes.sha1
    if (options.hashes?.sha256) headers["X-File-Sha256"] = options.hashes.sha256
    return r.post("/fs/multipart/init", undefined, { headers }) as unknown as Promise<
      Resp<MultipartSnapshot & { resumed: boolean }>
    >
  },

  chunk: (
    blob: Blob,
    uploadId: string,
    index: number,
    onProgress?: (loaded: number) => void,
    signal?: AbortSignal,
  ): Promise<Resp<MultipartSnapshot>> =>
    r.put("/fs/multipart/chunk", blob, {
      headers: {
        "X-Upload-Id": uploadId,
        "X-Chunk-Index": String(index),
        "Content-Type": "application/octet-stream",
      },
      signal,
      onUploadProgress: (e) => onProgress?.(e.loaded ?? 0),
    }) as unknown as Promise<Resp<MultipartSnapshot>>,

  complete: (uploadId: string): Promise<Resp<MultipartSnapshot>> =>
    r.post("/fs/multipart/complete", undefined, {
      headers: { "X-Upload-Id": uploadId },
    }) as unknown as Promise<Resp<MultipartSnapshot>>,

  status: (uploadId: string): Promise<Resp<MultipartSnapshot>> =>
    r.get(`/fs/multipart/status?upload_id=${encodeURIComponent(uploadId)}`) as unknown as Promise<
      Resp<MultipartSnapshot>
    >,

  abort: (uploadId: string): Promise<Resp<null>> =>
    r.post("/fs/multipart/abort", undefined, {
      headers: { "X-Upload-Id": uploadId },
    }) as unknown as Promise<Resp<null>>
}

/* ------------------------------- admin ---------------------------------- */
/* 管理接口需要管理员身份；非管理员 token 会得到 401/403。 */

/** 插件类型（对应服务端 / 官方前端 src/types/plugin.ts）。 */
export type PluginType =
  | "ui"
  | "preview"
  | "tool"
  | "theme"
  | "integration"
  | "system"

/** 插件配置表单字段的类型定义。 */
export interface PluginConfigField {
  key: string
  label: string
  type: "string" | "number" | "bool" | "select" | "text"
  defaultValue?: unknown
  options?: string[]
  description?: string
  required?: boolean
}

/** 插件条目（官方前端 PluginItem 的精简等价定义）。 */
export interface PluginItem {
  id: string
  name: string
  version: string
  description: string
  author?: string
  homepage?: string
  repository?: string
  icon?: string
  type: PluginType
  enabled: boolean
  high_privilege?: boolean
  permissions?: string[]
  entry_url?: string
  config_schema?: PluginConfigField[]
  config_values?: Record<string, unknown>
  target_hooks?: string[]
  is_builtin?: boolean
  tags?: string[]
  created_at?: string
  updated_at?: string
}

export const adminApi = {
  /* ------------------------------ 存储 ------------------------------ */
  storageList: (): Promise<PageResp<AdminStorage>> =>
    r.get("/admin/storage/list?page=1&per_page=200") as unknown as Promise<PageResp<AdminStorage>>,
  storageGet: (id: number): Promise<Resp<AdminStorage>> =>
    r.get(`/admin/storage/get?id=${id}`) as unknown as Promise<Resp<AdminStorage>>,
  storageCreate: (storage: Record<string, unknown>): Promise<Resp<{ id: number }>> =>
    r.post("/admin/storage/create", storage) as unknown as Promise<Resp<{ id: number }>>,
  storageUpdate: (storage: Record<string, unknown>): Promise<Resp<{ id: number }>> =>
    r.post("/admin/storage/update", storage) as unknown as Promise<Resp<{ id: number }>>,
  storageDelete: (id: number): Promise<Resp<null>> =>
    r.post(`/admin/storage/delete?id=${id}`) as unknown as Promise<Resp<null>>,
  storageEnable: (id: number): Promise<Resp<null>> =>
    r.post("/admin/storage/enable", { id }) as unknown as Promise<Resp<null>>,
  storageDisable: (id: number): Promise<Resp<null>> =>
    r.post("/admin/storage/disable", { id }) as unknown as Promise<Resp<null>>,
  storageLoadAll: (): Promise<Resp<null>> =>
    r.post("/admin/storage/load_all") as unknown as Promise<Resp<null>>,

  /* ------------------------------ 驱动 ------------------------------ */
  driverNames: (): Promise<Resp<string[]>> =>
    r.get("/admin/driver/names") as unknown as Promise<Resp<string[]>>,
  driverList: (): Promise<Resp<Drivers>> =>
    r.get("/admin/driver/list") as unknown as Promise<Resp<Drivers>>,
  driverInfo: (driver: string): Promise<Resp<DriverInfo>> =>
    r.get(`/admin/driver/info?driver=${encodeURIComponent(driver)}`) as unknown as Promise<Resp<DriverInfo>>,

  /* ------------------------------ 用户 ------------------------------ */
  userList: (): Promise<PageResp<AdminUser>> =>
    r.get("/admin/user/list?page=1&per_page=200") as unknown as Promise<PageResp<AdminUser>>,
  userCreate: (user: Record<string, unknown>): Promise<Resp<null>> =>
    r.post("/admin/user/create", user) as unknown as Promise<Resp<null>>,
  userUpdate: (user: Record<string, unknown>): Promise<Resp<null>> =>
    r.post("/admin/user/update", user) as unknown as Promise<Resp<null>>,
  userDelete: (id: number): Promise<Resp<null>> =>
    r.post(`/admin/user/delete?id=${id}`) as unknown as Promise<Resp<null>>,
  userCancel2fa: (id: number): Promise<Resp<null>> =>
    r.post("/admin/user/cancel_2fa", { id }) as unknown as Promise<Resp<null>>,
  userDelCache: (id: number): Promise<Resp<null>> =>
    r.post("/admin/user/del_cache", { id }) as unknown as Promise<Resp<null>>,

  /* ------------------------------ 设置 ------------------------------ */
  settingList: (group?: number): Promise<Resp<SettingItem[]>> =>
    r.get(`/admin/setting/list${group === undefined ? "" : `?group=${group}`}`) as unknown as Promise<
      Resp<SettingItem[]>
    >,
  settingSave: (items: { key: string; value: string }[]): Promise<Resp<null>> =>
    r.post("/admin/setting/save", items) as unknown as Promise<Resp<null>>,
  settingDefault: (group: number): Promise<Resp<SettingItem[]>> =>
    r.post(`/admin/setting/default?group=${group}`) as unknown as Promise<Resp<SettingItem[]>>,
  settingDelete: (key: string): Promise<Resp<null>> =>
    r.post(`/admin/setting/delete?key=${encodeURIComponent(key)}`) as unknown as Promise<Resp<null>>,

  /* ------------------------------ 元信息 ---------------------------- */
  metaList: (): Promise<PageResp<AdminMeta>> =>
    r.get("/admin/meta/list?page=1&per_page=200") as unknown as Promise<PageResp<AdminMeta>>,
  metaCreate: (meta: Record<string, unknown>): Promise<Resp<null>> =>
    r.post("/admin/meta/create", meta) as unknown as Promise<Resp<null>>,
  metaUpdate: (meta: Record<string, unknown>): Promise<Resp<null>> =>
    r.post("/admin/meta/update", meta) as unknown as Promise<Resp<null>>,
  metaDelete: (id: number): Promise<Resp<null>> =>
    r.post(`/admin/meta/delete?id=${id}`) as unknown as Promise<Resp<null>>,

  /* ------------------------------- 任务 ----------------------------- */
  taskList: (type: TaskTypeKey, done: boolean): Promise<Resp<TaskInfo[]>> =>
    r.get(`/admin/task/${type}/${done ? "done" : "undone"}`) as unknown as Promise<Resp<TaskInfo[]>>,
  taskCancel: (type: TaskTypeKey, tid: string): Promise<Resp<null>> =>
    r.post(`/admin/task/${type}/cancel?tid=${encodeURIComponent(tid)}`) as unknown as Promise<Resp<null>>,
  taskDelete: (type: TaskTypeKey, tid: string): Promise<Resp<null>> =>
    r.post(`/admin/task/${type}/delete?tid=${encodeURIComponent(tid)}`) as unknown as Promise<Resp<null>>,
  taskRetry: (type: TaskTypeKey, tid: string): Promise<Resp<null>> =>
    r.post(`/admin/task/${type}/retry?tid=${encodeURIComponent(tid)}`) as unknown as Promise<Resp<null>>,
  taskClearDone: (type: TaskTypeKey): Promise<Resp<null>> =>
    r.post(`/admin/task/${type}/clear_done`) as unknown as Promise<Resp<null>>,
  taskRetryFailed: (type: TaskTypeKey): Promise<Resp<null>> =>
    r.post(`/admin/task/${type}/retry_failed`) as unknown as Promise<Resp<null>>,

  /* ------------------------------- 索引 ----------------------------- */
  indexBuild: (paths: string[], maxDepth = -1): Promise<Resp<null>> =>
    r.post("/admin/index/build", { paths, max_depth: maxDepth }) as unknown as Promise<Resp<null>>,
  indexUpdate: (paths: string[], maxDepth = -1): Promise<Resp<null>> =>
    r.post("/admin/index/update", { paths, max_depth: maxDepth }) as unknown as Promise<Resp<null>>,
  indexStop: (): Promise<Resp<null>> => r.post("/admin/index/stop") as unknown as Promise<Resp<null>>,
  indexClear: (): Promise<Resp<null>> => r.post("/admin/index/clear") as unknown as Promise<Resp<null>>,
  indexProgress: (): Promise<Resp<Record<string, unknown>>> =>
    r.get("/admin/index/progress") as unknown as Promise<Resp<Record<string, unknown>>>,

  /* --------------------------- 消息 / Messenger --------------------- */
  /** POST /admin/message/get — 从服务端待发送队列弹出一条消息；队列为空时返回 code 404「no message」。 */
  messageGet: (): Promise<Resp<unknown>> =>
    r.post("/admin/message/get") as unknown as Promise<Resp<unknown>>,
  /** POST /admin/message/send — 向服务端发送一条消息，请求体仅含 `message` 字段。 */
  messageSend: (message: string): Promise<Resp<null>> =>
    r.post("/admin/message/send", { message }) as unknown as Promise<Resp<null>>,

  /* ------------------------------- 插件 ----------------------------- */
  /* 官方接口：/admin/plugin/{list,get,install,update,toggle,delete} */
  pluginList: (): Promise<PageResp<PluginItem>> =>
    r.get("/admin/plugin/list") as unknown as Promise<PageResp<PluginItem>>,
  pluginGet: (id: string): Promise<Resp<PluginItem>> =>
    r.get(`/admin/plugin/get?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<PluginItem>>,
  pluginInstall: (body: Record<string, unknown>): Promise<Resp<PluginItem>> =>
    r.post("/admin/plugin/install", body) as unknown as Promise<Resp<PluginItem>>,
  pluginUpdate: (body: Record<string, unknown>): Promise<Resp<PluginItem>> =>
    r.post("/admin/plugin/update", body) as unknown as Promise<Resp<PluginItem>>,
  pluginToggle: (id: string, enabled: boolean): Promise<Resp<{ id: string; enabled: boolean }>> =>
    r.post("/admin/plugin/toggle", { id, enabled }) as unknown as Promise<
      Resp<{ id: string; enabled: boolean }>
    >,
  pluginDelete: (id: string): Promise<Resp<null>> =>
    r.post(`/admin/plugin/delete?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<null>>,
}

/* ------------------------------- 分享 ----------------------------------- */
/* 分享属于用户态接口（AuthNotGuest）：管理员登录后看到的是自己的分享。 */

export const shareApi = {
  list: (page = 1, perPage = 200): Promise<PageResp<AdminShare>> =>
    r.get(`/share/list?page=${page}&per_page=${perPage}`) as unknown as Promise<PageResp<AdminShare>>,
  get: (id: string): Promise<Resp<AdminShare>> =>
    r.get(`/share/get?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<AdminShare>>,
  create: (share: Record<string, unknown>): Promise<Resp<AdminShare>> =>
    r.post("/share/create", share) as unknown as Promise<Resp<AdminShare>>,
  update: (share: Record<string, unknown>): Promise<Resp<null>> =>
    r.post("/share/update", share) as unknown as Promise<Resp<null>>,
  remove: (id: string): Promise<Resp<null>> =>
    r.post(`/share/delete?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<null>>,
  enable: (id: string): Promise<Resp<null>> =>
    r.post(`/share/enable?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<null>>,
  disable: (id: string): Promise<Resp<null>> =>
    r.post(`/share/disable?id=${encodeURIComponent(id)}`) as unknown as Promise<Resp<null>>,
}

/** Convenience re-export so components can `import { fsApi } from "@/api"`. */
export type { Obj }
