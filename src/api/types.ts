/**
 * Centralised OpenList response/domain types.
 * Source of truth: OpenList Go server (`server/handles`, `server/common`) and
 * the official frontend (`src/types`). Keep all `{ code, message, data }`
 * assumptions in this file so components never re-declare them.
 */

/** Every OpenList endpoint answers with this envelope. `code === 200` = success. */
export interface Resp<T> {
  code: number
  message: string
  data: T
}

export interface PageResp<T> {
  code: number
  message: string
  data: {
    content: T[]
    total: number
  }
}

/** Obj type discriminator returned by `/api/fs/list` and `/api/fs/get`. */
export enum ObjType {
  UNKNOWN = 0,
  FOLDER = 1,
  VIDEO = 2,
  AUDIO = 3,
  TEXT = 4,
  IMAGE = 5,
}

export interface MountDetails {
  total_space?: number
  free_space?: number
  used_space?: number
  driver_name: string
}

export interface Obj {
  name: string
  size: number
  is_dir: boolean
  created: string
  modified: string
  /** Signature required for protected/signed storages when fetching content. */
  sign?: string
  /** Thumbnail URL for images/videos (may be empty). */
  thumb: string
  type: ObjType
  hash_info?: Record<string, string>
  mount_details?: MountDetails
}

/** Data payload of `POST /api/fs/list`. */
export interface FsListData {
  content: Obj[] | null
  total: number
  readme: string
  header: string
  write: boolean
  write_content_bypass: boolean
  provider: string
  direct_upload_tools?: string[]
}

/** Data payload of `POST /api/fs/get`. */
export interface FsGetData extends Obj {
  raw_url: string
  readme: string
  header: string
  provider: string
  related: Obj[]
}

export interface SearchNode {
  parent: string
  name: string
  is_dir: boolean
  size: number
  path: string
  type: ObjType
}

export interface DirectoryNode extends Obj {
  children?: DirectoryNode[]
}

export type OrderBy = "" | "name" | "size" | "modified" | "type"
export type OrderDirection = "" | "asc" | "desc"

export interface ListParams {
  path: string
  password?: string
  page?: number
  per_page?: number
  refresh?: boolean
  order_by?: OrderBy
  order_direction?: OrderDirection
}

export interface SearchParams {
  parent: string
  keywords: string
  scope?: number
  page?: number
  per_page?: number
  password?: string
}

export interface LoginResult {
  token: string
}

export interface CurrentUser {
  id: number
  username: string
  base_path?: string
  role?: number
  disabled?: boolean
  permission?: number
  /** Bytes; -1/absent means unlimited. */
  otp?: boolean
}

/** `/api/public/settings` is an untyped key→value map straight from the server. */
export type PublicSettings = Record<string, unknown>

/** OpenList user roles (matches the server's `UserRole` enum). */
export enum UserRole {
  GENERAL = 0,
  GUEST = 1,
  ADMIN = 2,
}

export const isAdminRole = (role?: number): boolean => role === UserRole.ADMIN

export const roleLabel = (role?: number): string => {
  switch (role) {
    case UserRole.ADMIN:
      return "管理员"
    case UserRole.GUEST:
      return "访客"
    case UserRole.GENERAL:
      return "普通用户"
    default:
      return "未知"
  }
}

/** Row of `GET /api/admin/user/list`. */
export interface AdminUser {
  id: number
  username: string
  base_path: string
  role: UserRole
  permission: number
  disabled: boolean
  sso_id?: string
}

/* ============================ 管理后台领域类型 ============================ */
/* 与 OpenList 服务端 + 官方前端 src/types 保持一致 */

/** 驱动/设置字段的控件类型（服务端以字符串下发）。 */
export enum Type {
  String = "string",
  Select = "select",
  Bool = "bool",
  Text = "text",
  Number = "number",
  Float = "float",
  MultiPath = "multipath",
}

/** SettingItem.flag */
export enum Flag {
  PUBLIC = 0,
  PRIVATE = 1,
  READONLY = 2,
  DEPRECATED = 3,
}

/** SettingItem.group */
export enum Group {
  SINGLE = 0,
  SITE = 1,
  STYLE = 2,
  PREVIEW = 3,
  GLOBAL = 4,
  ARIA2 = 5,
  INDEX = 6,
  SSO = 7,
  LDAP = 8,
  S3 = 9,
  FTP = 10,
  TRAFFIC = 11,
}

export const GROUP_LABELS: Record<number, string> = {
  [Group.SINGLE]: "单项设置",
  [Group.SITE]: "站点",
  [Group.STYLE]: "样式",
  [Group.PREVIEW]: "预览",
  [Group.GLOBAL]: "全局",
  [Group.ARIA2]: "离线下载",
  [Group.INDEX]: "索引",
  [Group.SSO]: "SSO",
  [Group.LDAP]: "LDAP",
  [Group.S3]: "S3",
  [Group.FTP]: "FTP",
  [Group.TRAFFIC]: "限速",
}

export interface SettingItem {
  key: string
  value: string
  type: Type
  help: string
  options?: string
  group: Group
  flag: Flag
}

export interface DriverItem {
  name: string
  type: Type
  default: string
  options: string
  required?: boolean
  help?: string
}

export interface DriverConfig {
  name: string
  local_sort: boolean
  only_local: boolean
  only_proxy: boolean
  no_cache: boolean
  no_upload: boolean
  need_ms: boolean
  default_root: string
  alert?: string
}

export interface DriverInfo {
  common: DriverItem[]
  additional: DriverItem[]
  config: DriverConfig
}

/** `GET /api/admin/driver/list` 的返回：驱动名 -> 字段定义 */
export type Drivers = Record<string, DriverInfo>

/** `GET /api/admin/storage/list` 的行（= 服务端 model.Storage） */
export interface AdminStorage {
  id: number
  mount_path: string
  order: number
  driver: string
  status: string
  /** 驱动专属配置的 JSON 字符串 */
  addition: string
  remark: string
  modified: string
  order_by: string
  order_direction: string
  extract_folder: string
  web_proxy: boolean
  webdav_policy: string
  disabled: boolean
  mount_details?: MountDetails
}

/** `GET /api/admin/meta/list` 的行 */
export interface AdminMeta {
  id: number
  path: string
  password: string
  read_users: number[]
  read_users_sub: boolean
  write_users: number[]
  write_users_sub: boolean
  p_sub: boolean
  write: boolean
  w_sub: boolean
  hide: string
  h_sub: boolean
  readme: string
  r_sub: boolean
  header: string
  header_sub: boolean
}

/** `GET /api/share/list` 的行 */
export interface AdminShare {
  id: string
  expires: string | null
  pwd: string
  max_accessed: number
  disabled: boolean
  order_by: string
  order_direction: string
  extract_folder: string
  files: string[]
  remark: string
  readme: string
  header: string
  accessed?: number
  creator?: string
  creator_role?: number
  new_id?: string
}

/** `GET /api/admin/task/<type>/{undone,done}` 的行 */
export interface TaskInfo {
  id: string
  name: string
  creator: string
  creator_role: number
  state: number
  status: string
  progress: number
  start_time: string | null
  end_time: string | null
  total_bytes: number
  error: string
}

/** 任务种类（服务端 SetupTaskRoute 注册的全部类型） */
export const TASK_TYPES = [
  { key: "upload", label: "上传" },
  { key: "copy", label: "复制" },
  { key: "move", label: "移动" },
  { key: "offline_download", label: "离线下载" },
  { key: "offline_download_transfer", label: "离线下载转存" },
  { key: "decompress", label: "解压" },
  { key: "decompress_upload", label: "解压上传" },
] as const

export type TaskTypeKey = (typeof TASK_TYPES)[number]["key"]

/** tache.State 数值 → 文案（用于展示与按钮可用性判断）。 */
export const TASK_STATE_LABELS: Record<number, string> = {
  0: "排队中",
  1: "进行中",
  2: "取消中",
  3: "出错",
  4: "失败中",
  5: "等待重试",
  6: "重试前",
  7: "已取消",
  8: "已失败",
  9: "已完成",
}

export type Mutable = Record<string, unknown>
