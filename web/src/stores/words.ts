import { cloneElement, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { useAuthStore } from './auth'

/**
 * The words a business uses (§0B.15): "Product / Customer / Supplier" become e.g. "Article / Dealer / Mill" for a
 * textile business. The shared UI pieces (page titles, card titles, field labels, table headings, menus, buttons,
 * messages) pass their labels through {@link wordify}, so every screen follows the business's words. Data typed by
 * users and legal invoice wording are never changed.
 */
const DEFAULTS: Record<string, string> = {
  product: 'Product', products: 'Products', customer: 'Customer', customers: 'Customers',
  supplier: 'Supplier', suppliers: 'Suppliers', variantOptions: 'Size|Colour',
}

/** Display names of the product unit codes. */
export const UNIT_LABELS: Record<string, string> = {
  PCS: 'Pieces', NOS: 'Numbers', BOX: 'Box', PACK: 'Pack', CASE: 'Case', CARTON: 'Carton', DOZEN: 'Dozen', SET: 'Set',
  PAIR: 'Pair', KG: 'Kilogram', G: 'Gram', QUINTAL: 'Quintal', TONNE: 'Tonne', L: 'Litre', ML: 'Millilitre', M: 'Metre',
  CM: 'Centimetre', ROLL: 'Roll', COIL: 'Coil', REAM: 'Ream', BUNDLE: 'Bundle', BAG: 'Bag', SQFT: 'Square feet',
  CFT: 'Cubic feet', LOAD: 'Load',
}

/** Every unit code the system knows, in the usual order. */
export const ALL_UNITS = Object.keys(UNIT_LABELS)

export function terms(): Record<string, string> {
  return { ...DEFAULTS, ...(useAuthStore.getState().user?.vocabulary?.terms ?? {}) }
}

/** Current words, read at render time. */
export const W = {
  get product() { return terms().product },
  get products() { return terms().products },
  get customer() { return terms().customer },
  get customers() { return terms().customers },
  get supplier() { return terms().supplier },
  get suppliers() { return terms().suppliers },
  /** Default variant option names, e.g. ["Size", "Colour", "Weight"]. */
  get variantOptions() { return (terms().variantOptions ?? '').split('|').map((s) => s.trim()).filter(Boolean) },
}

const PATTERN = /\b(Products|Product|products|product|Customers|Customer|customers|customer|Suppliers|Supplier|suppliers|supplier)\b/g

/** Swaps the default words in a label for the business's own words. Other text is returned unchanged. */
export function wordify<T>(text: T): T {
  if (typeof text !== 'string') return text
  const t = terms()
  if (t.product === 'Product' && t.customer === 'Customer' && t.supplier === 'Supplier'
    && t.products === 'Products' && t.customers === 'Customers' && t.suppliers === 'Suppliers') return text
  return text.replace(PATTERN, (word) => {
    const lower = word.toLowerCase()
    const replacement = t[lower] ?? word
    return word.charAt(0) === word.charAt(0).toLowerCase() ? replacement.toLowerCase() : replacement
  }) as T
}

/** Units offered in unit dropdowns: the business's units, plus the current value if it is no longer listed. */
export function businessUnits(current?: string): string[] {
  const units = useAuthStore.getState().user?.vocabulary?.units
  const list = units && units.length ? [...units] : [...ALL_UNITS]
  if (current && !list.includes(current)) list.push(current)
  return list
}

export function unitLabel(code: string): string {
  const name = UNIT_LABELS[code]
  return name ? `${name} (${code})` : code
}

export function unitSelectOptions(current?: string) {
  return businessUnits(current).map((u) => ({ value: u, label: unitLabel(u) }))
}

/**
 * {@link wordify} for a small piece of static UI such as a breadcrumb link (icon + text): strings inside are swapped,
 * elements are copied with their text children swapped. Use only for fixed labels, never for user data.
 */
export function wordifyNode(node: ReactNode, depth = 0): ReactNode {
  if (typeof node === 'string') return wordify(node)
  if (depth > 3 || node == null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map((n) => wordifyNode(n, depth + 1))
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    return cloneElement(node, undefined, wordifyNode(node.props.children, depth + 1))
  }
  return node
}
