import Constants from 'expo-constants'
import { Platform } from 'react-native'

/**
 * Backend base URL. Set EXPO_PUBLIC_API_BASE_URL to override (e.g. https://api.example.com).
 * In development it defaults to port 8080 on the machine running the Expo dev server, so a phone on the same Wi-Fi
 * reaches the local backend without extra setup.
 */
function resolveApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:8080`
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  if (host) return `http://${host}:8080`
  return Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080'
}

export const API_BASE = resolveApiBase()
