import { Result, Schema } from "effect"
import { type CliFailure, failure } from "../../app/failure"
import type { JsonObject } from "./clients"

export type Change = "added" | "updated" | "unchanged"

export interface Merged {
  readonly text: string
  readonly change: Change
}

const JsonObjectText = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
const isObject = Schema.is(Schema.Record(Schema.String, Schema.Unknown))

export const refusal = (path: string, why: string) =>
  failure(`${path} ${why}; refusing to rewrite it.`, "Make the change by hand: see `smartplane connect print`.")

/** A JSON config file as an object; missing or empty is `{}`. Comments or a syntax error are refused. */
export const parseConfig = (existing: string | undefined, path: string): Result.Result<JsonObject, CliFailure> => {
  if (existing === undefined || existing.trim() === "") return Result.succeed({})
  const parsed = Schema.decodeUnknownResult(JsonObjectText)(existing)
  return Result.isFailure(parsed) ? Result.fail(refusal(path, "is not a plain JSON object (comments or a syntax error?)")) : Result.succeed(parsed.success)
}

export const changeOf = (previous: unknown, next: unknown): Change =>
  previous === undefined ? "added" : JSON.stringify(previous) === JSON.stringify(next) ? "unchanged" : "updated"

/**
 * Adds or replaces one server entry and leaves everything else in the file exactly as it was: other servers,
 * other settings, key order. A file that is not plain JSON (comments, a syntax error) is refused, never rewritten.
 */
export const mergeServer = (
  existing: string | undefined,
  options: { readonly path: string; readonly serversKey: string; readonly name: string; readonly entry: JsonObject }
): Result.Result<Merged, CliFailure> =>
  Result.flatMap(parseConfig(existing, options.path), (config): Result.Result<Merged, CliFailure> => {
    const refuse = (why: string) => Result.fail(refusal(options.path, why))
    const servers = config[options.serversKey] ?? {}
    if (!isObject(servers)) return refuse(`has a "${options.serversKey}" that is not an object`)
    const previous = servers[options.name]
    const change = changeOf(previous, options.entry)
    const next = { ...config, [options.serversKey]: { ...servers, [options.name]: options.entry } }
    return Result.succeed({ text: `${JSON.stringify(next, null, 2)}\n`, change })
  })
