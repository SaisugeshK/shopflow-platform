import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius } from '@/theme/tokens'
import { Button, IconButton } from './Button'
import { useKeyboardOverlap } from '@/hooks/useKeyboard'
import { Field, Input } from './Form'
import { KeyboardAwareScroll } from './KeyboardAware'
import { Text } from './Text'
import { wordify } from '@/store/words'

/**
 * Bottom sheet dialog: title, scrollable body and a sticky footer. Centred card on wide screens. When the keyboard
 * opens the sheet rises above it (and shrinks to the space left), keeping the focused field and footer visible.
 */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { ref, overlap } = useKeyboardOverlap()
  const maxHeight = Math.max(240, (height - overlap) * 0.9)
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View ref={ref} style={[styles.wrap, { paddingBottom: overlap }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close dialog" />
        <View style={[styles.sheet, { maxHeight, paddingBottom: overlap ? 8 : Math.max(insets.bottom, 12) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">{title}</Text>
            <IconButton icon="x" label="Close" onPress={onClose} />
          </View>
          <KeyboardAwareScroll pad={false} style={styles.sheetBody} contentContainerStyle={styles.body} footer={footer ? <View style={styles.footer}>{footer}</View> : undefined}>
            {children}
          </KeyboardAwareScroll>
        </View>
      </View>
    </Modal>
  )
}

/** Confirmation for destructive or important actions; optionally requires a reason (audited server-side). */
export function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Confirm', tone = 'primary', requireReason, reasonLabel = 'Reason', loading, onConfirm }: {
  open: boolean
  onClose: () => void
  title: string
  message?: string
  confirmLabel?: string
  tone?: 'primary' | 'danger'
  requireReason?: boolean
  reasonLabel?: string
  loading?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  const blocked = requireReason && reason.trim().length < 3
  return (
    <Sheet open={open} onClose={onClose} title={wordify(title)} footer={
      <View style={styles.actions}>
        <Button variant="secondary" onPress={onClose} style={{ flex: 1 }}>Back</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={blocked} onPress={() => onConfirm(reason.trim())} style={{ flex: 1 }}>{confirmLabel}</Button>
      </View>
    }>
      {message && <Text color="muted">{wordify(message)}</Text>}
      {requireReason && (
        <Field label={reasonLabel} required hint="At least 3 characters">
          <Input value={reason} onChangeText={setReason} multiline accessibilityLabel={reasonLabel} autoFocus />
        </Field>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  // Body takes only the height it needs and shrinks (scrolls) when the sheet is capped.
  sheetBody: { flex: 0, flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  body: { padding: 16, gap: 14 },
  footer: { paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  actions: { flexDirection: 'row', gap: 10 },
})
