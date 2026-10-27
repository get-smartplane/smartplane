import type { GuardGrounding } from "@pc/domain"

/**
 * A rule that names none of the systems it was grounded in ("agents never delete anything", scoped to the
 * one tool onboarding connected) is about the action anywhere. Shown that tool's list, the compiler used to
 * write "does this call delete something in Notion: notion-delete-pages or ...", which answers no for every
 * other tool name, so a plain `delete_file` call passed. These keep such a rule as broad as its wording.
 */
export const namesNoSystem = (grounding: GuardGrounding | undefined): boolean => {
  const targets = grounding?.targets ?? []
  return targets.length > 0 && targets.every((target) => target.matched === "scope" || target.matched === "model")
}

/** What the compiler is told when the rule names no system: the listed tools only illustrate it. */
export const unnamedSystemNote =
  "The rule names no system: it covers this action on anything, through any tool. The listed tools are examples from the system it is scoped to, " +
  "not the only ones. Ask about the action itself in the rule's own words, name listed tools only after \"for example\", never limit the question " +
  "to one product, and say that any other tool doing the same counts."

/** The sentence every such question ends with, so the classifier never reads the examples as the whole rule. */
export const anyToolClause = "Any tool or call that does this counts, whatever the tool is called or which system it belongs to."

const alreadyBroad = /\bany (?:other )?tool\b|\bwhatever (?:the )?tool\b/i

export const keepBroad = (instructions: string): string =>
  alreadyBroad.test(instructions) ? instructions : `${instructions.trimEnd()} ${anyToolClause}`

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Products the question confines itself to although the rule never names them ("something in Notion"). */
export const narrowedTo = (rule: string, instructions: string, products: ReadonlyArray<string>): ReadonlyArray<string> => {
  // Tool names ("notion__notion-delete-pages") are fine as examples; only the prose counts.
  const prose = instructions.replace(/\S*__\S*/g, " ")
  return [...new Set(products)].filter((product) => {
    const word = new RegExp(`\\b${escape(product)}\\b`, "i")
    return product.trim().length >= 2 && word.test(prose) && !word.test(rule)
  })
}
