/**
 * Parts of the Activepieces execution context that only exist inside an Activepieces deployment, with why
 * an action needing them cannot run in Smartplane. Everything else (auth, propsValue, store, project id,
 * run id, tags, output, and `files`, whose writes come back as a size note instead of a stored file) is
 * provided by the runner.
 */
export const unavailableContext: Readonly<Record<string, string>> = {
  server: "it calls the Activepieces server API",
  flows: "it reads Activepieces flows",
  agent: "it runs an Activepieces agent",
  connections: "it reads other Activepieces connections",
  generateResumeUrl: "it pauses a flow until a webhook resumes it"
}

const pausing = /\b(?:createWaitpoint|waitForWaitpoint|generateResumeUrl)\b|\brun\.pause\(/

const escape = (name: string) => name.replace(/[$]/g, "\\$")

/** The context members a `run` function's source touches: destructured keys, or `<param>.<member>` reads. */
export const contextMembers = (source: string): ReadonlySet<string> => {
  const parameter = /^\s*(?:async\s*)?(?:function\s*)?(?:[\w$]+\s*)?\(?\s*(\{[^}]*\}|[\w$]+)/.exec(source)?.[1]
  if (parameter === undefined) return new Set()
  if (parameter.startsWith("{")) return new Set(Array.from(parameter.matchAll(/(?:^|[{,])\s*([\w$]+)\s*(?=[:,}=])/g), (match) => match[1] ?? ""))
  return new Set(Array.from(source.matchAll(new RegExp(`(?<![\\w$.])${escape(parameter)}\\.([\\w$]+)`, "g")), (match) => match[1] ?? ""))
}

/**
 * Why an action cannot run outside Activepieces, judged from its `run` source, or `null`. A heuristic:
 * helpers it calls are not inspected, so the runner's context also fails with a typed error at run time.
 */
export const unavailableReason = (source: string): string | null => {
  if (pausing.test(source)) return unavailableContext.generateResumeUrl ?? null
  for (const member of contextMembers(source)) {
    const reason = unavailableContext[member]
    if (reason !== undefined) return reason
  }
  return null
}
