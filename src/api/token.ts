const TOKEN_KEY = "openlist-token"
const USERNAME_KEY = "openlist-username"

/**
 * Token storage helpers. Kept in a dependency-free module so both the axios
 * client and the auth store can import them without a cycle.
 */
export const getToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) || ""
  } catch {
    return ""
  }
}

export const setToken = (token: string): void => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage may be unavailable (private mode) — degrade silently */
  }
}

export const clearToken = (): void => setToken("")

export const getSavedUsername = (): string => {
  try {
    return localStorage.getItem(USERNAME_KEY) || ""
  } catch {
    return ""
  }
}

export const saveUsername = (username: string): void => {
  try {
    if (username) localStorage.setItem(USERNAME_KEY, username)
    else localStorage.removeItem(USERNAME_KEY)
  } catch {
    /* ignore */
  }
}
