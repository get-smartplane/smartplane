import type { CompiledGuard } from "@pc/domain"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status/status-badge"
import { RecompileDiff } from "./recompile-diff"

/** What the classifier will actually be told; a human reads this before activating. */
export function CompiledReview({ compiled, version }: { readonly compiled: CompiledGuard; readonly version: number }) {
  return (
    <div className="flex flex-col gap-4">
      {compiled.selfTest?.recompiled && <RecompileDiff recompiled={compiled.selfTest.recompiled} instructions={compiled.instructions} version={version} />}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">What the classifier is told</h3>
          <Badge variant="outline">v{version}</Badge>
        </div>
        <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3.5 text-xs leading-relaxed whitespace-pre-wrap">
          {compiled.instructions}
        </pre>
      </div>
      {compiled.examples.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Examples it learned from</h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {compiled.examples.map((example) => (
              <li key={example.action} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-24 shrink-0">
                  {example.violates ? (
                    <StatusBadge tone="danger">Breaks it</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Allowed</StatusBadge>
                  )}
                </span>
                <code className="min-w-0 truncate text-xs">{example.action}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
