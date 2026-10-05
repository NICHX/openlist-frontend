import driversRaw from "./zh-CN/drivers.json"
import settingsRaw from "./zh-CN/settings.json"
import settingsOtherRaw from "./zh-CN/settings_other.json"
import storagesRaw from "./zh-CN/storages.json"

/**
 * 管理后台中文文案。
 * 取自官方前端发布包 `dist/i18n.tar.gz` 的 zh-CN 词条，保证与官方后台用词一致；
 * 任何查不到的键都回退为原始 key，绝不显示空白。
 */
type Dict = Record<string, unknown>

const settings = settingsRaw as Dict
const drivers = driversRaw as Dict
const storages = storagesRaw as Dict
const settingsOther = settingsOtherRaw as Dict
const storageCommon = (storages.common ?? {}) as Dict

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const sub = (dict: unknown): Dict | undefined => (dict && typeof dict === "object" ? (dict as Dict) : undefined)

/* -------------------------------- 设置 -------------------------------- */

/** 设置项标签，例如 `site_title` → 「网站标题」。 */
export const tSetting = (key: string): string => str(settings[key]) ?? key

/** 设置项说明（官方以 `key-tips` 存放）。 */
export const tSettingTip = (key: string): string => str(settings[`${key}-tips`]) ?? ""

/** 下拉选项：官方约定为 `<key>s.<option>`（如 pagination_types.all）。 */
export const tSettingOption = (key: string, option: string): string =>
  str(sub(settings[`${key}s`])?.[option]) ?? str(sub(settings[key])?.[option]) ?? option

/** 设置页的其它文案（未知类型提示等）。 */
export const tSettingsOther = (key: string): string => str(settingsOther[key]) ?? key

/* -------------------------------- 驱动 -------------------------------- */

/** 驱动显示名，例如 `123Pan` → 「123 云盘」。 */
export const tDriverName = (driver: string): string => str(sub(drivers.drivers)?.[driver]) ?? driver

/** 驱动专属字段标签（additional 字段）。 */
export const tDriverField = (driver: string, field: string): string =>
  str(sub(drivers[driver])?.[field]) ?? field

/** 驱动专属字段说明（`field-tips`）。 */
export const tDriverFieldTip = (driver: string, field: string): string =>
  str(sub(drivers[driver])?.[`${field}-tips`]) ?? ""

/** 驱动级配置块的说明（如 config.alert）。 */
export const tDriverConfig = (driver: string, key: string): string =>
  str(sub(sub(drivers.config)?.[driver])?.[key]) ?? ""

/** 驱动专属字段的下拉选项，例如（driver, "webdav_policy", "302_redirect"）。 */
export const tDriverOption = (driver: string, field: string, option: string): string =>
  str(sub(sub(drivers[driver])?.[`${field}s`])?.[option]) ?? tStorageOption(field, option)

/** 驱动提示（config.alert）；查不到返回空串，避免界面出现原始翻译 key。 */
export const tDriverAlert = (driver: string): string => str(sub(sub(drivers.config)?.[driver])?.["alert"]) ?? ""

/* ------------------------------ 存储通用 ------------------------------ */

/** 存储通用字段标签（common 字段），例如 `mount_path` → 「挂载路径」。 */
export const tStorageField = (field: string): string => str(storageCommon[field]) ?? field

/** 存储通用字段说明（`field-tips`）。 */
export const tStorageFieldTip = (field: string): string => str(storageCommon[`${field}-tips`]) ?? ""

/** 存储通用下拉选项（如 webdav_policys.302_redirect）。 */
export const tStorageOption = (key: string, option: string): string =>
  str(sub(storageCommon[`${key}s`])?.[option]) ?? option

/**
 * 字段标签统一入口：先按驱动专属查，再按存储通用查，最后回退原始名。
 * 管理后台的表单都用它，避免出现英文 key。
 */
export const tFieldLabel = (opts: {
  name: string
  driver?: string
  scope?: "common" | "additional"
}): string => {
  if (opts.scope === "common") return tStorageField(opts.name)
  if (opts.driver) {
    const specific = str(sub(drivers[opts.driver])?.[opts.name])
    if (specific) return specific
  }
  return tStorageField(opts.name)
}

/** 字段说明统一入口。 */
export const tFieldTip = (opts: {
  name: string
  driver?: string
  scope?: "common" | "additional"
}): string => {
  if (opts.scope === "common") return tStorageFieldTip(opts.name)
  if (opts.driver) {
    const specific = tDriverFieldTip(opts.driver, opts.name)
    if (specific) return specific
  }
  return tStorageFieldTip(opts.name)
}
