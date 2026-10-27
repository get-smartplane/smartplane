import { cn } from "@/lib/utils"

const maxLines = 3000

type LineStyle = "plain" | "frontmatter" | "heading"

/** Markdown gets two cues and nothing more: the frontmatter recedes and headings stand out. */
const stylesOf = (lines: ReadonlyArray<string>, markdown: boolean): ReadonlyArray<LineStyle> => {
  if (!markdown) return lines.map(() => "plain")
  const closing = lines[0] === "---" ? lines.indexOf("---", 1) : -1
  return lines.map((line, index) => (index <= closing ? "frontmatter" : /^#{1,6}\s/.test(line) ? "heading" : "plain"))
}

const styleClass: { readonly [S in LineStyle]: string } = {
  plain: "",
  frontmatter: "text-muted-foreground",
  heading: "font-semibold text-foreground"
}

/** Read-only, monospace, with line numbers; very long files are cut with a note rather than freezing the page. */
export function TextView({ text, markdown }: { readonly text: string; readonly markdown: boolean }) {
  const all = text.replace(/\n$/, "").split("\n")
  const lines = all.slice(0, maxLines)
  const styles = stylesOf(lines, markdown)
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <pre className="min-w-fit py-3 font-mono text-xs leading-5" tabIndex={0} aria-label="File contents">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span aria-hidden="true" className="w-12 shrink-0 pr-4 text-right text-muted-foreground/60 select-none tabular-nums">
              {index + 1}
            </span>
            <span className={cn("pr-4 whitespace-pre", styleClass[styles[index] ?? "plain"])}>{line || " "}</span>
          </div>
        ))}
      </pre>
      {all.length > maxLines && <p className="border-t px-4 py-2 text-xs text-muted-foreground">Showing the first {maxLines} of {all.length} lines.</p>}
    </div>
  )
}
