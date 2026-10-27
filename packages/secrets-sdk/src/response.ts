import { isSafeEnvName } from "./env-names.js"
import { InvalidResponseError } from "./errors.js"

/**
 * The delivery reply, checked by hand. A schema library would be the usual choice (and is, in the rest of
 * Smartplane), but this package stays dependency-free, so the boundary check is this small guard instead.
 */
export type DeliveredKind = "secret" | "variable"
export type DenyReason = "not_deliverable" | "no_grant" | "unknown" | "policy"

export interface DeliveredValue {
  readonly name: string
  readonly value: string
  readonly kind: DeliveredKind
  readonly version: number | string | null
  readonly resourceId: string
}

export interface DeniedName {
  readonly name: string
  readonly reason: DenyReason
}

export interface Delivery {
  readonly env: ReadonlyArray<DeliveredValue>
  readonly denied: ReadonlyArray<DeniedName>
  readonly expiresAt: string | null
  /** Names the server sent that are not safe env names (e.g. `NODE_OPTIONS`); skipped, never set. */
  readonly refused: ReadonlyArray<string>
}

type Json = Record<string, unknown>

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === "string"
const isKind = (value: unknown): value is DeliveredKind => value === "secret" || value === "variable"
const isReason = (value: unknown): value is DenyReason =>
  value === "not_deliverable" || value === "no_grant" || value === "unknown" || value === "policy"

const fail = (what: string): never => {
  throw new InvalidResponseError(`Unexpected delivery response: ${what}.`)
}

const value = (item: unknown, index: number): DeliveredValue => {
  if (!isRecord(item)) return fail(`env[${index}] is not an object`)
  const { name, value, kind, version, resourceId } = item
  if (!isString(name) || !isString(value) || !isString(resourceId)) return fail(`env[${index}] lacks name, value or resourceId`)
  if (!isKind(kind)) return fail(`env[${index}].kind is not secret or variable`)
  const okVersion = version === null || version === undefined || isString(version) || typeof version === "number"
  if (!okVersion) return fail(`env[${index}].version is not a number or string`)
  return { name, value, kind, version: version ?? null, resourceId }
}

const denied = (item: unknown, index: number): DeniedName => {
  if (!isRecord(item) || !isString(item.name) || !isReason(item.reason)) return fail(`denied[${index}] is malformed`)
  return { name: item.name, reason: item.reason }
}

export const parseDelivery = (body: unknown): Delivery => {
  if (!isRecord(body)) return fail("not an object")
  if (!Array.isArray(body.env) || !Array.isArray(body.denied)) return fail("env and denied must be arrays")
  if (body.expiresAt !== null && body.expiresAt !== undefined && !isString(body.expiresAt)) return fail("expiresAt is not a string")
  const env = body.env.map(value)
  return {
    env: env.filter((item) => isSafeEnvName(item.name)),
    denied: body.denied.map(denied),
    expiresAt: body.expiresAt ?? null,
    refused: env.filter((item) => !isSafeEnvName(item.name)).map((item) => item.name)
  }
}
