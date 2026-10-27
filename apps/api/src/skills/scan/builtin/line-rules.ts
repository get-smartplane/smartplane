import type { ScanSeverity } from "@pc/domain"

/** Where a rule looks: every text file, only scripts, or only markdown. */
export type RuleScope = "text" | "script" | "markdown"

/** A pattern matched line by line against text files; one finding per rule and file. */
export interface LineRule {
  readonly id: string
  readonly severity: ScanSeverity
  readonly scope: RuleScope
  readonly title: string
  readonly detail: string
  readonly pattern: RegExp
}

const rule = (id: string, severity: ScanSeverity, scope: RuleScope, title: string, detail: string, pattern: RegExp): LineRule => ({
  id: `builtin/${id}`,
  severity,
  scope,
  title,
  detail,
  pattern
})

/** Static rules for the classic ways a skill turns hostile. Kept conservative: each is a reason to look, not proof. */
export const lineRules: ReadonlyArray<LineRule> = [
  rule("remote-pipe-shell", "critical", "text", "Downloads and runs a remote script", "Piping curl/wget output into a shell runs code that is not in the bundle and can change at any time.",
    /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/i),
  rule("remote-eval", "critical", "text", "Evaluates remote content", "eval/exec of downloaded content runs code that was never reviewed.",
    /\b(?:eval|exec|source)\b[^\n]*(?:\$\(\s*(?:curl|wget)|<\(\s*(?:curl|wget))|\beval\s*\(\s*(?:await\s+)?fetch\(|\bexec\s*\(\s*(?:urllib|requests)\.|\b(?:iex|Invoke-Expression)\b[^\n]*(?:DownloadString|iwr|Invoke-WebRequest)/i),
  rule("decode-and-run", "high", "text", "Decodes and runs hidden code", "Running base64- or hex-decoded content hides what actually executes.",
    /base64\s+(?:-d|--decode)\b[^\n]*\|\s*(?:ba)?sh|\b(?:exec|eval)\s*\(\s*(?:base64\.)?(?:b64decode|a2b_hex|bytes\.fromhex|atob|Buffer\.from)\b/i),
  rule("encoded-blob", "medium", "text", "Large encoded blob", "Long base64 or hex strings can smuggle payloads past review.",
    /[A-Za-z0-9+/]{240,}={0,2}|(?:\\x[0-9a-fA-F]{2}){32,}|\b(?:[0-9a-fA-F]{2}){160,}\b/),
  rule("hidden-unicode", "high", "text", "Hidden or bidirectional Unicode", "Zero-width, bidi-override and tag characters can hide instructions from human reviewers while models still read them.",
    /[‪-‮⁦-⁩​-‍⁠᠎]|﻿(?!^)|[\u{E0000}-\u{E007F}]/u),
  rule("hardcoded-secret", "high", "text", "Hard-coded credential", "Credentials belong in Smartplane secret resources, never in a skill.",
    /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9]{32,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|glpat-[A-Za-z0-9_-]{20})\b|-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/),
  rule("exfiltration", "critical", "text", "Sends secrets or local files to a URL", "Posting environment variables, credentials or local files to a remote host is data exfiltration.",
    /\b(?:curl|wget)\b[^\n]*(?:-d|--data(?:-binary|-raw)?|-F|--form|-T|--upload-file|--post-file)\b[^\n]*(?:\$\{?\w*(?:TOKEN|KEY|SECRET|PASSWORD|CREDENTIALS)|\$\(\s*(?:env|printenv)|~\/\.ssh|\.aws\/credentials|\/etc\/(?:passwd|shadow)|\.env\b|@\/)|\b(?:env|printenv|cat\s+[^\n|]*(?:\.env|\.ssh|\.aws|\.netrc))\b[^\n]*\|\s*(?:curl|wget|nc|ncat)\b|\b(?:requests|httpx|axios)\.(?:post|put)\([^\n]*(?:os\.environ|process\.env)/i),
  rule("exfil-endpoint", "medium", "text", "Known data-capture endpoint", "Request bins, tunnels and chat webhooks are common exfiltration targets.",
    /\b(?:webhook\.site|requestbin\.(?:com|net)|pipedream\.net|[a-z0-9-]+\.ngrok(?:-free)?\.(?:io|app)|burpcollaborator\.net|interact\.sh|oast\.(?:pro|fun|me)|canarytokens\.com|discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/services)\b/i),
  rule("destructive-rm", "high", "text", "Deletes the home or root directory", "rm -rf on /, ~ or $HOME destroys the machine the agent runs on.",
    /\brm\s+(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)+(?:--no-preserve-root\s+)?(?:\/|~|\$HOME|\$\{HOME\})(?:\/\*?)?(?=\s|$|;|&)/),
  rule("world-writable", "medium", "text", "Makes files world-writable", "chmod 777 lets any local user change what the agent later runs.", /\bchmod\s+(?:-R\s+)?0?777\b/),
  rule("sudo", "low", "script", "Runs commands as root", "A skill script rarely needs root; sudo widens what a mistake or an attack can do.", /(?:^|[;&|]\s*|\s)sudo\s+\S/),
  rule("network-call", "low", "script", "Script makes network calls", "Network access in scripts is worth checking against the skill's stated purpose.",
    /\b(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|nc\s+-|ncat)\b|\b(?:requests|httpx)\.(?:get|post|put|delete|request)\(|\bfetch\(\s*["'`]https?:|\burllib\.request\b|\bhttp\.client\b|\baxios\b/),
  rule("install-from-url", "medium", "text", "Installs a package from a URL", "Packages installed from URLs or git skip registry provenance and pinning.",
    /\b(?:pip3?|uv\s+pip|npm|pnpm|yarn|bun|gem|cargo)\s+(?:install|add|i)\b[^\n]*(?:https?:\/\/|git\+|git@)/i),
  rule("ignore-instructions", "high", "text", "Tries to override the agent's instructions", "Telling the model to ignore earlier instructions or reveal its system prompt is prompt injection.",
    /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|system)\s+(?:instructions|prompts?|messages|rules|directives)\b|\b(?:reveal|print|output|repeat)\s+(?:your\s+|the\s+)?system\s+prompt\b|\byou\s+are\s+no\s+longer\s+(?:bound|an?\s+assistant)/i),
  rule("disable-safety", "high", "text", "Tries to disable safety controls", "Instructions to bypass permissions, sandboxes or guardrails defeat the controls Smartplane enforces.",
    /\b(?:disable|bypass|turn\s+off|skip|circumvent|evade)\s+(?:all\s+|any\s+)?(?:the\s+)?(?:safety|security|guard\s?rails?|content\s+filters?|sandbox(?:ing)?|permission\s+(?:checks?|prompts?)|approvals?)\b|--dangerously-skip-permissions|dangerouslyDisableSandbox|--no-sandbox\b/i)
]
