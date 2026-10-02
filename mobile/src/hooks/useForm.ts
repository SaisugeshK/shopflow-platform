import { useState } from 'react'
import type { z } from 'zod'

/**
 * Minimal form state + Zod validation for React Native screens. Errors are shown only after the first submit,
 * then update as the user types.
 */
export function useForm<S extends z.ZodType<Record<string, unknown>>>(schema: S, initial: z.input<S>) {
  const [values, setValues] = useState<z.input<S>>(initial)
  const [submitted, setSubmitted] = useState(false)
  const result = schema.safeParse(values)
  const errors: Record<string, string> = {}
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (!errors[key]) errors[key] = issue.message
    }
  }
  return {
    values,
    set: <K extends keyof z.input<S>>(key: K, value: z.input<S>[K]) => setValues((v) => ({ ...(v as object), [key]: value }) as z.input<S>),
    reset: (v: z.input<S>) => {
      setValues(v)
      setSubmitted(false)
    },
    error: (key: string, server?: string) => (submitted ? errors[key] : undefined) ?? server,
    /** Runs onValid with the parsed values, or reveals the errors. */
    submit: (onValid: (v: z.output<S>) => void) => {
      setSubmitted(true)
      if (result.success) onValid(result.data)
    },
  }
}
