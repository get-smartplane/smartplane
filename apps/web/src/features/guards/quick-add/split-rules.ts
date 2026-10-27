/** The longest rule the API takes. */
export const MaxRuleLength = 4000

/** List markers people paste with their rules: "- ", "* ", "• ", "1. ", "2) ", "[ ] ", and combinations ("- [ ] "). */
const marker = /^\s*(?:(?:[-*•–]|\d{1,3}[.)]|\[[ xX]?\])\s+)+/

/** One pasted line as a rule: marker and surrounding space gone, inner runs of space collapsed. */
export const cleanRule = (line: string): string => line.replace(marker, "").replace(/\s+/g, " ").trim()

/** The rules in a pasted text, one per non-empty line. A single line means "paste as usual". */
export const splitRules = (text: string): ReadonlyArray<string> =>
  text.split(/\r?\n/).map(cleanRule).filter((rule) => rule !== "")

/** What Enter does with the typed text: nothing for blank text, else the cleaned rule (cut to the API's limit). */
export const ruleToAdd = (text: string): string | undefined => {
  const rule = cleanRule(text)
  return rule === "" ? undefined : rule.slice(0, MaxRuleLength)
}
