import type { DenyReason } from "@pc/domain"

const shown = (value: unknown): string => {
  if (typeof value === "string") return value.length > 57 ? `“${value.slice(0, 57)}…”` : `“${value}”`
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/**
 * Why one call was refused, in a sentence. `used` is the refused argument's value, when the caller has the
 * call's arguments (the audit log does), so an argument limit reads as "repo “x” is outside ...".
 */
export const describeDenyReason = (reason: DenyReason, used?: unknown): string => {
  switch (reason._tag) {
    case "UnknownTool":
      return `No tool named "${reason.tool}" is available to the caller.`
    case "UnknownSkill":
      return `No skill named "${reason.name}" is available to the caller.`
    case "NoGrant":
      return "No grant covers this resource."
    case "ActionNotGranted":
      return `The grant does not allow "${reason.required}".`
    case "ToolNotAllowed":
      return `The tool "${reason.tool}" is not on the grant's allow-list.`
    case "ArgumentNotAllowed":
      return used === undefined
        ? `The grant only allows "${reason.tool}" for certain values of "${reason.path}", and this call used another.`
        : `"${reason.tool}" was called with ${reason.path} = ${shown(used)}, which no grant allows.`
    case "GuardViolation":
      return `A rule flagged this action (${Math.round(reason.probability * 100)}% likely violation).`
    case "GuardUnavailable":
      return "A rule could not be evaluated, so the action was denied."
    case "NotConnected":
      return "Allowed, but the account it acts as is not connected (a per-user account the caller has not connected, or a shared one nobody has)."
  }
}

/**
 * Events written before `UnknownTool` existed recorded unknown tools as a bare `{ _tag: "NoGrant" }`. The
 * audit log is append-only, so those rows stay and still need words.
 */
export const describeDenyTag = (tag: string): string => (tag === "NoGrant" ? "No tool by that name is available to the caller." : `Denied (${tag}).`)
