import { Schema } from "effect"
import { SafePath, SafeSlug } from "./paths"
import { FileMode } from "./source"

/** File in each skills directory recording which folders Smartplane wrote, and exactly what it wrote. */
export const manifestFile = ".smartplane.json"

/**
 * A record whose every key must decode as `key`. `Schema.Record` with a refined key silently drops keys that fail,
 * and a manifest with unsafe keys must be refused, not quietly repaired.
 */
const recordWithKeys = <V extends Schema.Top>(key: Schema.Codec<string>, value: V) => {
  const isKey = Schema.is(key)
  return Schema.Record(Schema.String, value).check(
    Schema.makeFilter((record: Readonly<Record<string, unknown>>) => Object.keys(record).every(isKey), { expected: "safe keys" })
  )
}

export const ManagedFile = Schema.Struct({ hash: Schema.String, mode: FileMode })

export const ManagedSkill = Schema.Struct({
  /** Server content version (or a local hash); equal versions skip reading the skill again. */
  version: Schema.String,
  /** sha256 per relative path as written; anything else on disk means someone edited the folder. */
  files: recordWithKeys(SafePath, ManagedFile),
  syncedAt: Schema.String
})
export type ManagedSkill = typeof ManagedSkill.Type

export const Manifest = Schema.Struct({
  version: Schema.Literal(2),
  managedBy: Schema.Literal("smartplane"),
  apiUrl: Schema.String,
  /**
   * The manifest is committed with the repository, so it is untrusted input: sync removes the files it lists.
   * Keys are held to the same rules as paths from the gateway, and a manifest that breaks them is refused whole.
   */
  skills: recordWithKeys(SafeSlug, ManagedSkill)
})
export type Manifest = typeof Manifest.Type

export const ManifestJson = Schema.fromJsonString(Manifest)

/** `skills-lock.json` from `npx skills`: folders listed there belong to that tool. */
export const SkillsLock = Schema.fromJsonString(Schema.Struct({ skills: Schema.Record(Schema.String, Schema.Unknown) }))
