import type { InvalidInput } from "@pc/domain"
import { describeError } from "@/lib/api/describe-error"
import type { ApiError } from "@/lib/api/errors"
import { asSentence, formatBytes } from "./format"
import { archiveLimits } from "./create/skill-source"

export interface SkillFailure {
  readonly title: string
  readonly description: string
  /** Skill folders the source holds, when it holds several and none was chosen. */
  readonly candidates: ReadonlyArray<string>
}

const limits = `Skills can be up to ${formatBytes(archiveLimits.maxBytes)} and ${archiveLimits.maxFiles} files.`

/** The API names candidates as "3 skills found (a, b, c); choose…" or "…Skills found: a, b." */
const candidatesIn = (message: string): ReadonlyArray<string> => {
  const list = /skills found \((.+)\); choose/.exec(message)?.[1] ?? /Skills found: (.+)\.$/.exec(message)?.[1]
  if (list === undefined || list === "none") return []
  return list.split(", ").filter((folder) => folder !== "(root)")
}

const missingFolder = /^no SKILL\.md in "(.+)"/

const invalid = ({ message, field }: InvalidInput): SkillFailure => {
  const candidates = candidatesIn(message)
  const plain = (title: string, description: string): SkillFailure => ({ title, description, candidates })
  switch (field) {
    case "path": {
      const missing = missingFolder.exec(message)?.[1]
      if (missing !== undefined) return plain(`No skill in "${missing}"`, candidates.length > 0 ? "These folders hold a SKILL.md:" : "This source has no folder with a SKILL.md.")
      if (candidates.length > 0) return plain("Choose one skill", `This source holds ${candidates.length} skills. A skill is created from one folder:`)
      return plain("No SKILL.md found", "A skill is a folder with a SKILL.md at its top. Check the path, or add the file.")
    }
    case "archive":
      return plain("This archive can't be used", `${asSentence(message)} ${limits}`)
    case "url":
      return plain("This link can't be fetched", asSentence(message))
    case "tokenSecretId":
      return plain("The token secret is gone", "The GitHub token secret no longer exists. Choose another one under Advanced options.")
    case "source":
      return plain("GitHub couldn't find it", asSentence(message))
    default:
      return plain("Check the details", asSentence(message))
  }
}

/** Plain-language copy for anything creating or updating a skill can fail with; never a raw tag. */
export const describeSkillError = (error: ApiError): SkillFailure => {
  switch (error._tag) {
    case "InvalidInput":
      return invalid(error)
    case "UpstreamFailure":
      return {
        title: error.upstream === "github" ? "GitHub didn't answer" : "The source didn't answer",
        description: `${asSentence(error.message)} Try again in a moment.`,
        candidates: []
      }
    case "Conflict":
      return { title: "Not possible right now", description: asSentence(error.message), candidates: [] }
    default:
      return { ...describeError(error), candidates: [] }
  }
}
