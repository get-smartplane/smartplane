import { type Token, tokenize } from "./lexer"

/**
 * The only table functions a read-only grant may call: they generate rows and reach nothing outside the
 * database. Every other one is refused, so a new reader (`iceberg()`, `deltaLake()`, `hudi()`, `url()`, ...)
 * cannot make the customer's ClickHouse fetch from their network until someone vets and lists it.
 */
const allowedNames = ["numbers", "numbers_mt", "zeros", "zeros_mt", "generate_series", "generateSeries", "values", "view", "null"]
export const allowedTableFunctions: ReadonlySet<string> = new Set(allowedNames.map((name) => name.toLowerCase()))
/** `x IN tuple(...)` and `x IN array(...)` are value lists, not tables. */
const inValueLists: ReadonlySet<string> = new Set(["tuple", "array"])
/** SQL-standard syntax with FROM inside a function's parentheses: `EXTRACT(DAY FROM d)`, `TRIM(BOTH ' ' FROM s)`. */
const fromInsideCall: ReadonlySet<string> = new Set(["extract", "substring", "substr", "trim", "position", "overlay"])
/** Clauses after which a comma no longer separates tables. */
const endsTableList: ReadonlySet<string> = new Set([
  "WHERE", "PREWHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "SETTINGS", "FORMAT", "UNION", "EXCEPT", "INTERSECT", "WINDOW", "QUALIFY", "SELECT", "INTO", "ARRAY"
])

interface Frame {
  readonly call: string | undefined
  tableList: boolean
}

const textOf = (token: Token | undefined): string | undefined => token?.kind === "word" || token?.kind === "name" ? token.text : undefined
const keyword = (token: Token | undefined): string => (token?.kind === "word" ? token.text.toUpperCase() : "")

/** The function named by `tokens[at]` when it is called (`name(`), lower-cased. */
const calledAt = (tokens: ReadonlyArray<Token>, at: number): string | undefined => {
  const name = textOf(tokens[at])
  const open = tokens[at + 1]
  return name !== undefined && open?.kind === "punct" && open.text === "(" ? name.toLowerCase() : undefined
}

type Position = { readonly at: number; readonly allowed: ReadonlySet<string> } | undefined

/** Where a table expression starts after `tokens[index]`, if `tokens[index]` introduces one. */
const tablePosition = (tokens: ReadonlyArray<Token>, index: number, frame: Frame): Position => {
  const token = tokens[index]
  const word = keyword(token)
  if (word === "FROM") {
    if (frame.call !== undefined && fromInsideCall.has(frame.call)) return undefined
    if (keyword(tokens[index - 1]) === "DISTINCT" && ["IS", "NOT"].includes(keyword(tokens[index - 2]))) return undefined
    frame.tableList = true
    return { at: index + 1, allowed: allowedTableFunctions }
  }
  if (word === "JOIN") {
    if (keyword(tokens[index - 1]) === "ARRAY") return undefined
    frame.tableList = true
    return { at: index + 1, allowed: allowedTableFunctions }
  }
  if (word === "IN") {
    // `POSITION(needle IN haystack)` is the SQL-standard spelling of a string search, not a set test.
    if (frame.call === "position") return undefined
    return { at: index + 1, allowed: new Set([...allowedTableFunctions, ...inValueLists]) }
  }
  if (index === 0 && (word === "DESCRIBE" || word === "DESC")) return { at: keyword(tokens[1]) === "TABLE" ? 2 : 1, allowed: allowedTableFunctions }
  if (token?.kind === "punct" && token.text === "," && frame.tableList) return { at: index + 1, allowed: allowedTableFunctions }
  if (endsTableList.has(word)) frame.tableList = false
  return undefined
}

/**
 * Why a read-only statement is refused for its table functions, or undefined when it calls only allowed
 * ones. `readonly=1` does not stop table functions, so this is the line that keeps `url()` and friends out.
 * Statements the lexer cannot read unambiguously are refused rather than guessed at.
 */
export const tableFunctionRefusal = (sql: string): string | undefined => {
  const tokens = tokenize(sql)
  if ("unreadable" in tokens) return `a read-only grant cannot run SQL with ${tokens.unreadable}`
  const frames: Array<Frame> = [{ call: undefined, tableList: false }]
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const frame = frames[frames.length - 1] ?? { call: undefined, tableList: false }
    if (token?.kind === "punct" && token.text === "(") {
      frames.push({ call: textOf(tokens[index - 1])?.toLowerCase(), tableList: false })
      continue
    }
    if (token?.kind === "punct" && token.text === ")") {
      if (frames.length > 1) frames.pop()
      continue
    }
    const position = tablePosition(tokens, index, frame)
    const called = position === undefined ? undefined : calledAt(tokens, position.at)
    if (position !== undefined && called !== undefined && !position.allowed.has(called)) {
      return `a read-only grant cannot call the ${textOf(tokens[position.at]) ?? called}() table function; only ${allowedNames.join(", ")} are allowed`
    }
  }
  return undefined
}
