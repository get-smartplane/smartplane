import { EnvName, isLoaderEnvName } from "@pc/domain"
import { Effect, FileSystem, Redacted, Schema } from "effect"
import { note } from "../../../app/output"
import { classify } from "./classify"
import type { Candidate } from "./create"
import type { EnvFile } from "./discover"
import { parseDotenv } from "./parse"

const isEnvName = Schema.is(EnvName)

export interface Candidates {
  readonly candidates: ReadonlyArray<Candidate>
  readonly skipped: ReadonlyArray<{ readonly name: string; readonly reason: string }>
}

/**
 * Every name in the chosen files, classified. A later file overrides an earlier one (`.env.local` over
 * `.env`), as the frameworks that read both do. Values are wrapped in `Redacted` as soon as they are read.
 */
export const readCandidates = (files: ReadonlyArray<EnvFile>, options: { readonly quiet: boolean } = { quiet: false }) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const byName = new Map<string, Candidate>()
    const skipped = new Map<string, string>()
    for (const file of files) {
      const { entries, unreadable } = parseDotenv(yield* fs.readFileString(file.path))
      if (unreadable > 0 && !options.quiet) yield* note(`  ${file.name}: ${unreadable} line${unreadable === 1 ? "" : "s"} could not be read and were left out.`)
      for (const entry of entries) {
        if (!isEnvName(entry.name)) {
          skipped.set(entry.name, isLoaderEnvName(entry.name) ? "changes how programs load code, so Smartplane never delivers it" : "not an env name Smartplane delivers (A-Z, 0-9 and _)")
          continue
        }
        if (entry.value === "") {
          skipped.set(entry.name, `empty in ${file.name}`)
          byName.delete(entry.name)
          continue
        }
        const previous = byName.get(entry.name)
        if (previous !== undefined && Redacted.value(previous.value) !== entry.value && !options.quiet) yield* note(`  ${entry.name}: using ${file.name}, which overrides ${previous.file}.`)
        skipped.delete(entry.name)
        byName.set(entry.name, { name: entry.name, value: Redacted.make(entry.value), ...classify(entry.name, entry.value), file: file.name })
      }
    }
    return { candidates: [...byName.values()], skipped: [...skipped].map(([name, reason]) => ({ name, reason })) } satisfies Candidates
  })
