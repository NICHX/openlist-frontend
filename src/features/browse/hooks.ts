import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { fsApi, unwrap } from "@/api"
import type { ListParams, OrderBy, OrderDirection } from "@/api/types"

export const fsKeys = {
  all: ["fs"] as const,
  list: (path: string, page: number, perPage: number, orderBy: OrderBy, orderDirection: OrderDirection) =>
    ["fs", "list", { path, page, perPage, orderBy, orderDirection }] as const,
  detail: (path: string) => ["fs", "get", path] as const,
  dirs: (path: string) => ["fs", "dirs", path] as const,
  drives: () => ["fs", "drives"] as const,
  search: (parent: string, keywords: string, scope: number, page: number) =>
    ["fs", "search", { parent, keywords, scope, page }] as const,
}

export const useFsInvalidate = () => {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: fsKeys.all })
}

/** Directory listing with pagination + sorting; keeps prior page while loading. */
export function useDirectoryList(
  path: string,
  options: {
    page?: number
    perPage?: number
    orderBy?: OrderBy
    orderDirection?: OrderDirection
    password?: string
    enabled?: boolean
  } = {},
) {
  const { page = 1, perPage = 0, orderBy = "", orderDirection = "", password = "", enabled = true } = options
  return useQuery({
    queryKey: fsKeys.list(path, page, perPage, orderBy, orderDirection),
    queryFn: ({ signal }) =>
      fsApi.list({ path, page, per_page: perPage, order_by: orderBy, order_direction: orderDirection, password }, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    enabled,
    retry: false,
  })
}

/** File detail (adds `raw_url` used for download/preview). */
export function useFileDetail(path: string | null, password = "") {
  return useQuery({
    queryKey: fsKeys.detail(path ?? ""),
    queryFn: () => fsApi.get(path as string, password),
    enabled: Boolean(path),
    staleTime: 60_000,
    retry: false,
    // 预览内切换文件时保留上一个文件的详情，避免导航按钮/播放器闪一下。
    placeholderData: keepPreviousData,
  })
}

/** Directory tree for the "移动到" picker. */
export function useDirectoryTree(path = "/", enabled = true) {
  return useQuery({
    queryKey: fsKeys.dirs(path),
    queryFn: () => fsApi.dirs(path, "", true),
    enabled,
    staleTime: 60_000,
    retry: false,
  })
}

/** Top-level mounts, used by the sidebar to render drives + quota bars. */
export function useDrives(enabled = true) {
  return useQuery({
    queryKey: fsKeys.drives(),
    queryFn: () => fsApi.list({ path: "/", page: 1, per_page: 0, refresh: false }),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** File mutations with automatic cache invalidation. */
export function useFsMutations() {
  const invalidate = useFsInvalidate()

  const mkdir = useMutation({
    mutationFn: (path: string) => fsApi.mkdir(path).then(unwrap),
    onSuccess: invalidate,
  })

  const rename = useMutation({
    mutationFn: (vars: { path: string; name: string; overwrite?: boolean }) =>
      fsApi.rename(vars.path, vars.name, vars.overwrite ?? false).then(unwrap),
    onSuccess: invalidate,
  })

  const move = useMutation({
    mutationFn: (vars: { srcDir: string; dstDir: string; names: string[]; overwrite?: boolean }) =>
      fsApi.move(vars.srcDir, vars.dstDir, vars.names, vars.overwrite ?? false).then(unwrap),
    onSuccess: invalidate,
  })

  const copy = useMutation({
    mutationFn: (vars: { srcDir: string; dstDir: string; names: string[] }) =>
      fsApi.copy(vars.srcDir, vars.dstDir, vars.names).then(unwrap),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (vars: { dir: string; names: string[] }) =>
      fsApi.remove(vars.dir, vars.names).then(unwrap),
    onSuccess: invalidate,
  })

  return { mkdir, rename, move, copy, remove, invalidate }
}

export type DirectoryQuery = ReturnType<typeof useDirectoryList>
export type { ListParams }
