import type { Schema } from "effect"

export type Json = Schema.Json
export type JsonObject = { readonly [key: string]: Json }

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))

/** The JSON form of `value`, or `undefined` when it has none (functions, NaN, class instances, cycles). */
export const toJson = (value: unknown, seen: ReadonlySet<unknown> = new Set()): Json | undefined => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (seen.has(value)) return undefined
  const inner = new Set([...seen, value])
  if (Array.isArray(value)) {
    const items = value.map((item) => toJson(item, inner))
    return items.every((item) => item !== undefined) ? items.filter((item) => item !== undefined) : undefined
  }
  if (!isPlainObject(value)) return undefined
  const entries = Object.entries(value).map(([key, item]) => [key, toJson(item, inner)] as const)
  return entries.every(([, item]) => item !== undefined)
    ? Object.fromEntries(entries.flatMap(([key, item]) => (item === undefined ? [] : [[key, item]])))
    : undefined
}

export const isPrimitive = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
