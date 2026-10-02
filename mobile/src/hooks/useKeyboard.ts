import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, type View } from 'react-native'

/**
 * Keyboard handling that works on Android edge-to-edge (where the window is NOT resized for the keyboard) and iOS.
 * A container measures how much of it the keyboard covers and pads itself by that amount, so its content and any
 * footer button sit above the keyboard.
 */
const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'

export function useKeyboardOverlap() {
  const ref = useRef<View>(null)
  const [overlap, setOverlap] = useState(0)
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)
  useEffect(() => {
    const show = Keyboard.addListener(SHOW, (e) => {
      const top = e.endCoordinates.screenY
      setKeyboardTop(top)
      ref.current?.measureInWindow((_x, y, _w, h) => setOverlap(Math.max(0, Math.round(y + h - top))))
    })
    const hide = Keyboard.addListener(HIDE, () => {
      setOverlap(0)
      setKeyboardTop(null)
    })
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  return { ref, overlap, keyboardOpen: keyboardTop !== null }
}

/** Inputs announce focus so the scroll container around them can bring them into view (also when moving field to field). */
const focusListeners = new Set<() => void>()

export function notifyInputFocus() {
  focusListeners.forEach((l) => l())
}

export function onInputFocus(listener: () => void) {
  focusListeners.add(listener)
  return () => {
    focusListeners.delete(listener)
  }
}
