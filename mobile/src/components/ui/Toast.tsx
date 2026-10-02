import { Feather } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { create } from 'zustand'
import { ApiError } from '@/services/api'
import { colors, radius, shadow } from '@/theme/tokens'
import { Text } from './Text'

type Tone = 'success' | 'error' | 'warning' | 'info'

export interface ToastOptions {
  /** Auto-dismiss delay in ms (default 4s, errors 7s). */
  duration?: number
  action?: { label: string; onPress: () => void }
}

interface ToastItem {
  id: number
  tone: Tone
  title: string
  message?: string
  action?: ToastOptions['action']
}

let nextId = 1

const useToastStore = create<{ toasts: ToastItem[]; push: (t: ToastItem, duration: number) => void; dismiss: (id: number) => void; clear: () => void }>((set, get) => ({
  toasts: [],
  push: (t, duration) => {
    set({ toasts: [...get().toasts.slice(-2), t] })
    setTimeout(() => get().dismiss(t.id), duration)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
  clear: () => set({ toasts: [] }),
}))

function show(tone: Tone, title: string, message?: string, options?: ToastOptions) {
  useToastStore.getState().push({ id: nextId++, tone, title, message, action: options?.action }, options?.duration ?? (tone === 'error' ? 7000 : 4000))
}

/** Toast API; callable from anywhere (screens, mutation callbacks). */
export const toast = {
  show,
  success: (title: string, message?: string) => show('success', title, message),
  info: (title: string, message?: string, options?: ToastOptions) => show('info', title, message, options),
  warning: (title: string, message?: string) => show('warning', title, message),
  /** Removes all toasts (e.g. the demo OTP once signed in). */
  clear: () => useToastStore.getState().clear(),
  error: (error: unknown, fallback = 'Something went wrong') => {
    const e = error instanceof ApiError ? error : null
    show('error', e ? e.message : fallback, e?.details?.map((d) => d.message).join(' · ') || undefined)
  },
}

const TONE = {
  success: { color: colors.success, icon: 'check-circle' as const },
  error: { color: colors.danger, icon: 'alert-octagon' as const },
  warning: { color: colors.warning, icon: 'alert-triangle' as const },
  info: { color: colors.primary, icon: 'info' as const },
}

function ToastView({ t }: { t: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const [anim] = useState(() => new Animated.Value(0))
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start()
  }, [anim])
  const tone = TONE[t.tone]
  return (
    <Animated.View
      accessibilityRole={t.tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.toast, { borderLeftColor: tone.color, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}
    >
      <Feather name={tone.icon} size={18} color={tone.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="700" testID="toast-title">{t.title}</Text>
        {t.message && <Text variant="small" color="muted">{t.message}</Text>}
      </View>
      {t.action && (
        <Pressable accessibilityRole="button" onPress={t.action.onPress} style={styles.action}>
          <Text variant="small" weight="700" color="primary">{t.action.label}</Text>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={() => dismiss(t.id)}>
        <Feather name="x" size={16} color={colors.muted} />
      </Pressable>
    </Animated.View>
  )
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const insets = useSafeAreaInsets()
  if (!toasts.length) return null
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {toasts.map((t) => <ToastView key={t.id} t={t} />)}
    </View>
  )
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 12, right: 12, gap: 8, alignItems: 'center', zIndex: 1000 },
  toast: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderLeftWidth: 4, ...shadow.raised },
  action: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
})
