import { Feather } from '@expo/vector-icons'
import { forwardRef, useRef, useState, type ReactNode } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Switch as RNSwitch, TextInput, View, type TextInputProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { notifyInputFocus, useKeyboardOverlap } from '@/hooks/useKeyboard'
import { colors, radius, TOUCH } from '@/theme/tokens'
import { Text } from './Text'
import { wordify } from '@/store/words'

/** Label + control + error/hint, with the error announced to screen readers. */
export function Field({ label, error, hint, required, children }: { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <View style={styles.field}>
      {label && (
        <Text variant="small" weight="600">
          {wordify(label)}
          {required && <Text variant="small" color="danger"> *</Text>}
        </Text>
      )}
      {children}
      {error ? (
        <Text variant="xs" color="danger" accessibilityLiveRegion="polite">{error}</Text>
      ) : hint ? (
        <Text variant="xs" color="muted">{hint}</Text>
      ) : null}
    </View>
  )
}

export interface InputProps extends TextInputProps {
  invalid?: boolean
  prefix?: ReactNode
  /** Shows a × button while the field has text. */
  clearable?: boolean
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ invalid, prefix, clearable, style, multiline, value, onChangeText, editable = true, ...rest }, ref) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={[styles.inputWrap, multiline && styles.multiline, focused && styles.focused, invalid && styles.invalid, !editable && styles.readonly]}>
      {prefix}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.muted}
        style={[styles.input, multiline && { textAlignVertical: 'top', paddingTop: 10 }, style]}
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        maxFontSizeMultiplier={1.4}
        {...rest}
        placeholder={wordify(rest.placeholder)}
        onFocus={(e) => {
          setFocused(true)
          notifyInputFocus()
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          rest.onBlur?.(e)
        }}
      />
      {clearable && !!value && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => onChangeText?.('')} style={styles.clear}>
          <Feather name="x" size={14} color={colors.muted} />
        </Pressable>
      )}
    </View>
  )
})

export function SearchBar({ value, onChangeText, placeholder = 'Search…', onSubmit, autoFocus }: { value: string; onChangeText: (v: string) => void; placeholder?: string; onSubmit?: () => void; autoFocus?: boolean }) {
  return (
    <Input
      value={value}
      onChangeText={onChangeText}
      placeholder={wordify(placeholder)}
      accessibilityLabel={wordify(placeholder)}
      returnKeyType="search"
      onSubmitEditing={onSubmit}
      autoCorrect={false}
      autoCapitalize="none"
      autoFocus={autoFocus}
      clearable
      prefix={<Feather name="search" size={17} color={colors.muted} style={{ marginLeft: 12 }} />}
    />
  )
}

export function PhoneInput(props: Omit<InputProps, 'prefix' | 'keyboardType'>) {
  return (
    <Input
      keyboardType="phone-pad"
      maxLength={10}
      autoComplete="tel"
      textContentType="telephoneNumber"
      prefix={<Text weight="600" style={{ marginLeft: 12 }}>+91</Text>}
      {...props}
    />
  )
}

/** One hidden input drives six boxes, so paste and SMS autofill (one-time-code) work. */
export function OTPInput({ value, onChange, length = 6, disabled, autoFocus }: { value: string; onChange: (v: string) => void; length?: number; disabled?: boolean; autoFocus?: boolean }) {
  const ref = useRef<TextInput>(null)
  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="One-time password" style={styles.otpRow}>
      {Array.from({ length }).map((_, i) => {
        const active = i === Math.min(value.length, length - 1)
        return (
          <View key={i} style={[styles.otpBox, active && styles.focused]}>
            <Text variant="h2">{value[i] ?? ''}</Text>
          </View>
        )
      })}
      <TextInput
        ref={ref}
        testID="otp-input"
        accessibilityLabel="Enter OTP"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        editable={!disabled}
        caretHidden
        style={styles.otpHidden}
      />
    </Pressable>
  )
}

export interface Option {
  value: string
  label: string
  hint?: string
}

/** Select rendered as a bottom sheet list (native pickers differ too much across platforms). */
export function Select({ value, onChange, options, placeholder = 'Select…', label, invalid, searchable }: { value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; label?: string; invalid?: boolean; searchable?: boolean }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const insets = useSafeAreaInsets()
  const { ref: wrapRef, overlap } = useKeyboardOverlap()
  const selected = options.find((o) => o.value === value)
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? placeholder}: ${selected?.label ?? 'not selected'}`}
        onPress={() => setOpen(true)}
        style={[styles.inputWrap, invalid && styles.invalid, { paddingHorizontal: 12 }]}
      >
        <Text style={{ flex: 1 }} color={selected ? 'text' : 'muted'} numberOfLines={1}>{selected?.label ?? wordify(placeholder)}</Text>
        <Feather name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View ref={wrapRef} style={{ flex: 1, paddingBottom: overlap }}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: overlap ? 8 : insets.bottom + 8 }]}>
          <View style={styles.sheetHandle} />
          {label && <Text variant="h3" style={{ paddingHorizontal: 16, paddingBottom: 8 }}>{label}</Text>}
          {(searchable || options.length > 12) && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><SearchBar value={q} onChangeText={setQ} /></View>
          )}
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value)
                  setOpen(false)
                  setQ('')
                }}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surface2 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text weight={item.value === value ? '600' : '400'}>{item.label}</Text>
                  {item.hint && <Text variant="xs" color="muted">{item.hint}</Text>}
                </View>
                {item.value === value && <Feather name="check" size={18} color={colors.primary} />}
              </Pressable>
            )}
          />
        </View>
        </View>
      </Modal>
    </>
  )
}

export function SwitchRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text weight="500">{label}</Text>
        {hint && <Text variant="xs" color="muted">{hint}</Text>}
      </View>
      <RNSwitch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.white} />
    </View>
  )
}

export function QuantityStepper({ value, onChange, min = 1, max, disabled, label = 'Quantity' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean; label?: string }) {
  const clamp = (v: number) => Math.max(min, max != null ? Math.min(max, v) : v)
  return (
    <View style={[styles.stepper, disabled && { opacity: 0.5 }]} accessibilityLabel={label}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={disabled || value <= min} onPress={() => onChange(clamp(value - 1))} style={styles.stepBtn}>
        <Feather name="minus" size={16} color={value <= min ? colors.borderStrong : colors.text} />
      </Pressable>
      <TextInput
        accessibilityLabel={label}
        value={String(value)}
        onChangeText={(t) => {
          const n = Number(t.replace(/[^\d]/g, ''))
          if (n > 0) onChange(clamp(n))
        }}
        keyboardType="number-pad"
        editable={!disabled}
        onFocus={notifyInputFocus}
        selectTextOnFocus
        style={styles.stepValue}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={disabled || (max != null && value >= max)} onPress={() => onChange(clamp(value + 1))} style={styles.stepBtn}>
        <Feather name="plus" size={16} color={max != null && value >= max ? colors.borderStrong : colors.text} />
      </Pressable>
    </View>
  )
}

/** Horizontal, scrollable filter chips (single select). */
export function ChipGroup({ options, value, onChange }: { options: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <FlatList
      horizontal
      data={options}
      keyExtractor={(o) => o.value || '_all'}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
      renderItem={({ item }) => {
        const active = item.value === value
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text variant="small" weight="600" style={{ color: active ? colors.white : colors.text }}>{item.label}</Text>
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  inputWrap: { minHeight: TOUCH, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center' },
  multiline: { minHeight: 96, alignItems: 'flex-start' },
  input: { flex: 1, minHeight: TOUCH - 2, paddingHorizontal: 12, fontSize: 15, color: colors.text },
  focused: { borderColor: colors.primary, borderWidth: 2 },
  invalid: { borderColor: colors.danger },
  readonly: { backgroundColor: colors.surface2 },
  clear: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  otpBox: { width: 46, height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  otpHidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.02, color: 'transparent' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '75%', paddingTop: 8 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 12 },
  option: { minHeight: TOUCH + 4, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TOUCH },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  stepBtn: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepValue: { width: 48, height: 40, textAlign: 'center', fontSize: 15, fontWeight: '600', color: colors.text, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
})

/** Rupee amount entry (decimal keypad, ₹ prefix). Values stay strings so no float rounding happens in the app. */
export function MoneyInput(props: Omit<InputProps, 'prefix' | 'keyboardType' | 'onChangeText'> & { onChangeText: (v: string) => void }) {
  const { onChangeText, ...rest } = props
  return (
    <Input
      keyboardType="decimal-pad"
      prefix={<Text weight="600" color="muted" style={{ marginLeft: 12 }}>₹</Text>}
      onChangeText={(t) => {
        const clean = t.replace(/[^\d.]/g, '')
        const [whole, ...dec] = clean.split('.')
        onChangeText(dec.length ? `${whole}.${dec.join('').slice(0, 2)}` : clean)
      }}
      {...rest}
    />
  )
}

/** Decimal quantity entry (up to 3 decimals). */
export function QtyInput(props: Omit<InputProps, 'keyboardType' | 'onChangeText'> & { onChangeText: (v: string) => void }) {
  const { onChangeText, ...rest } = props
  return (
    <Input
      keyboardType="decimal-pad"
      onChangeText={(t) => {
        const clean = t.replace(/[^\d.]/g, '')
        const [whole, ...dec] = clean.split('.')
        onChangeText(dec.length ? `${whole}.${dec.join('').slice(0, 3)}` : clean)
      }}
      style={{ textAlign: 'right' }}
      {...rest}
    />
  )
}
