import * as SecureStore from 'expo-secure-store'

/**
 * Refresh token storage on iOS/Android: Keychain / Keystore via expo-secure-store (§5, MASVS-STORAGE).
 * Never AsyncStorage or other plain storage.
 */
const KEY = 'sf.refreshToken'

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token: string) => SecureStore.setItemAsync(KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(KEY),
}
