import type { ResourceId } from "@pc/domain"
import { Effect } from "effect"
import { Atom } from "effect/reactivity"
import { apiQuery } from "@/lib/api/atoms"
import { gunzip, readTar } from "./read-bundle"

/**
 * The active version's files, for read-only previews. It is the same download the CLI makes (a `read`
 * grant is required and it is audited as `skill.downloaded`), so it only runs once someone opens a file.
 */
export const bundleAtom = Atom.family((id: ResourceId) =>
  apiQuery(["skills"], (api) =>
    api.skills.bundle({ params: { id } }).pipe(
      Effect.flatMap((archive) => Effect.promise(() => gunzip(archive))),
      Effect.map(readTar)
    )
  )
)

const strict = new TextDecoder("utf-8", { fatal: true })

/** UTF-8 without NUL bytes reads as text; anything else is shown as binary. */
export const asText = (bytes: Uint8Array): string | undefined => {
  if (bytes.includes(0)) return undefined
  try {
    return strict.decode(bytes)
  } catch {
    return undefined
  }
}
