import type { ScanFinding } from "@pc/domain"
import { DateTime, Effect } from "effect"
import { extensionOf } from "../../bundle/mime"
import { reportOf, type ScanFile, type ScanInput, type SkillScanner } from "../scanner"
import { fileTypeFindings, frontmatterFindings } from "./bundle-rules"
import { type LineRule, lineRules, type RuleScope } from "./line-rules"

const scriptExtensions = new Set(["sh", "bash", "zsh", "fish", "py", "js", "mjs", "cjs", "ts", "rb", "pl", "php", "ps1", "bat", "cmd", "lua", "go", "rs"])
const markdownExtensions = new Set(["md", "markdown", "mdx"])

const inScope = (file: ScanFile, scope: RuleScope): boolean => {
  const extension = extensionOf(file.path)
  switch (scope) {
    case "text":
      return true
    case "markdown":
      return markdownExtensions.has(extension)
    case "script":
      return scriptExtensions.has(extension) || file.mode === "755" || (file.path.startsWith("scripts/") && !markdownExtensions.has(extension))
  }
}

/** The first matching line, with how many more matched, so a noisy file yields one finding per rule. */
const matchRule = (rule: LineRule, file: ScanFile, lines: ReadonlyArray<string>): ScanFinding | undefined => {
  const hits = lines.flatMap((line, index) => (rule.pattern.test(line) ? [index + 1] : []))
  const [first] = hits
  if (first === undefined) return undefined
  const more = hits.length > 1 ? ` (${hits.length - 1} more line${hits.length > 2 ? "s" : ""})` : ""
  return { scanner: "builtin", ruleId: rule.id, severity: rule.severity, title: rule.title, detail: `${rule.detail}${more}`, file: file.path, line: first }
}

export const lineFindings = (files: ReadonlyArray<ScanFile>, rules: ReadonlyArray<LineRule> = lineRules): ReadonlyArray<ScanFinding> =>
  files.flatMap((file) => {
    if (file.text === undefined) return []
    const lines = file.text.split(/\r?\n/)
    return rules.flatMap((rule) => {
      if (!inScope(file, rule.scope)) return []
      const found = matchRule(rule, file, lines)
      return found === undefined ? [] : [found]
    })
  })

/** Static checks that run inside the Worker in milliseconds: patterns, frontmatter sanity and file types. */
export const builtinScanner: SkillScanner = {
  id: "builtin",
  version: "1",
  scan: (input: ScanInput) =>
    Effect.gen(function*() {
      const startedAt = yield* DateTime.now
      const findings = [...frontmatterFindings(input), ...fileTypeFindings(input), ...lineFindings(input.files)]
      yield* Effect.annotateCurrentSpan({ "scan.findings": findings.length })
      return yield* reportOf(builtinScanner, startedAt, findings)
    }).pipe(Effect.withSpan("SkillScanner.builtin"))
}
