import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ScrollView, TextInput, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { onInputFocus, useKeyboardOverlap } from '@/hooks/useKeyboard'

const GAP = 16

/**
 * Scroll container that stays usable with the on-screen keyboard open:
 * - pads itself by the part the keyboard covers, so the scroll area and the optional footer sit above the keyboard;
 * - scrolls the focused input into view when the keyboard opens and when focus moves to another field.
 * Use it for every screen, sheet or list header that contains text inputs.
 */
export function KeyboardAwareScroll({ children, footer, style, contentContainerStyle, onKeyboardChange, pad = true, ...rest }: ScrollViewProps & {
  children: ReactNode
  footer?: ReactNode
  style?: StyleProp<ViewStyle>
  onKeyboardChange?: (open: boolean) => void
  /** false when an outer container (e.g. a sheet) already moves above the keyboard; only scroll-into-view then. */
  pad?: boolean
}) {
  const { ref, overlap, keyboardOpen } = useKeyboardOverlap()
  const scrollRef = useRef<ScrollView>(null)
  const offset = useRef(0)

  const revealFocused = useCallback(() => {
    // Wait for the padding/layout change before measuring.
    setTimeout(() => {
      const input = TextInput.State.currentlyFocusedInput()
      const scroll = scrollRef.current
      if (!input || !scroll) return
      const node = scroll as unknown as View
      node.measureInWindow((_sx, sy, _sw, sh) => {
        input.measureInWindow((_ix, iy, _iw, ih) => {
          const visibleTop = sy + GAP
          const visibleBottom = sy + sh - GAP
          if (iy + ih > visibleBottom) scroll.scrollTo({ y: offset.current + (iy + ih - visibleBottom), animated: true })
          else if (iy < visibleTop) scroll.scrollTo({ y: Math.max(0, offset.current - (visibleTop - iy)), animated: true })
        })
      })
    }, 80)
  }, [])

  useEffect(() => {
    onKeyboardChange?.(keyboardOpen)
    if (keyboardOpen) revealFocused()
  }, [keyboardOpen, overlap, revealFocused, onKeyboardChange])

  useEffect(() => onInputFocus(() => {
    if (keyboardOpen) revealFocused()
  }), [keyboardOpen, revealFocused])

  return (
    <View ref={ref} style={[{ flex: 1, paddingBottom: pad ? overlap : 0 }, style]}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        {...rest}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y
          rest.onScroll?.(e)
        }}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
      {footer}
    </View>
  )
}
