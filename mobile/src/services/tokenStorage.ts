/**
 * Browser build (Expo web, used for development and automated tests): the refresh token is kept in memory only, so a
 * page reload signs the user out. Browsers have no equivalent of the Keychain, and web storage is readable by scripts.
 * Native builds use tokenStorage.native.ts (secure store).
 */
let memory: string | null = null

export const tokenStorage = {
  get: async () => memory,
  set: async (token: string) => {
    memory = token
  },
  clear: async () => {
    memory = null
  },
}
