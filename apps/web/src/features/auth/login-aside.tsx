import { DecisionStream } from "./decision-stream"

export function LoginAside() {
  return (
    <div className="flex max-w-lg flex-col gap-8">
      <p className="font-display text-[2.75rem] leading-[1] font-[700] tracking-[-0.04em] text-balance">Clear skies for your AI agents.</p>
      <p className="max-w-md text-[0.9375rem] text-sky-ink/85">
        One MCP endpoint, access by role, plain-English rules checked before every action, every call on the record.
      </p>
      <DecisionStream />
    </div>
  )
}
