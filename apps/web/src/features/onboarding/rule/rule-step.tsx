import { type Guard, verifyActive } from "@pc/domain"
import { ArrowRight, Power, Sparkles } from "lucide-react"
import { useState, type FormEvent } from "react"
import { StatusBadge } from "@/components/status/status-badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { VerifyCompact } from "@/features/guards/verify/verify-compact"
import { VerifyPoller } from "@/features/guards/verify/verify-poller"
import { StepFrame } from "../setup/step-frame"
import type { SetupController } from "../setup/use-setup"
import { useSetupTool } from "../setup/use-setup-tool"
import { SpeechBubble } from "../sky/speech-bubble"
import { ModeExplainer } from "./mode-explainer"
import { RuleComposer, type RuleChoice } from "./rule-composer"
import { RuleTry } from "./rule-try"
import { freeTextSample, suggestionsFor } from "./suggestions"
import { useSetupGuard } from "./use-setup-guard"

export function RuleStep({ controller }: { readonly controller: SetupController }) {
  const tool = useSetupTool(controller.setup)
  const suggestions = suggestionsFor(tool)
  const rules = useSetupGuard(controller, tool)
  const [choice, setChoice] = useState<RuleChoice>(0)
  const [own, setOwn] = useState("")
  const [error, setError] = useState<string>()
  const [rewriting, setRewriting] = useState(false)
  const guard = rewriting ? undefined : rules.guard
  const sample = (target: Guard) =>
    suggestions.find((candidate) => candidate.starterId === target.compiled?.starter || candidate.rule === target.rule)?.sample ?? freeTextSample
  const suggestion = choice === "own" ? undefined : suggestions[choice]
  const rule = choice === "own" ? own.trim() : suggestion?.rule ?? ""

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (rule === "") return setError("Describe the rule in a sentence.")
    if (rule.length > 4000) return setError("Keep the rule under 4,000 characters.")
    setError(undefined)
    await (suggestion === undefined ? rules.createAndCompile(rule) : rules.createFromSuggestion(suggestion))
    setRewriting(false)
  }

  const primary =
    guard === undefined ? (
      <Button type="submit" form="setup-rule" disabled={rules.compiling}>
        {rules.compiling ? <Spinner /> : <Sparkles />}
        {suggestion === undefined ? (rules.compiling ? "Verifying…" : "Verify and test") : rules.compiling ? "Adding…" : "Use this rule"}
      </Button>
    ) : guard.status === "active" ? (
      <Button onClick={() => void controller.finish("done", { guardId: guard.id })} disabled={controller.saving}>
        Continue
        <ArrowRight />
      </Button>
    ) : guard.compiled === null || verifyActive(guard.verify) || guard.verify?.stage === "failed" || guard.verify?.stage === "cancelled" ? (
      <Button onClick={() => void rules.recompile(guard)} disabled={rules.compiling}>
        {rules.compiling ? <Spinner /> : <Sparkles />}
        {rules.compiling ? "Verifying…" : "Verify"}
      </Button>
    ) : (
      <Button onClick={() => void rules.activate(guard)} disabled={rules.activating}>
        {rules.activating ? <Spinner /> : <Power />}
        Turn on in monitor mode
      </Button>
    )

  return (
    <StepFrame
      index={2}
      title="Add a guard rule"
      description="Say in plain words what agents must never do. Smartplane checks every call against it before it runs."
      onBack={() => controller.go("access")}
      onSkip={() => void controller.finish("skipped")}
      skipping={controller.saving}
      primary={primary}
    >
      {guard === undefined ? (
        <form id="setup-rule" onSubmit={submit} noValidate>
          <RuleComposer suggestions={suggestions} choice={choice} onChoice={setChoice} own={own} onOwn={setOwn} error={error} />
        </form>
      ) : (
        <>
          <VerifyPoller guard={guard} />
          <SpeechBubble>“{guard.rule}”</SpeechBubble>
          <div className="flex flex-wrap items-center gap-3">
            {guard.status === "active" ? <StatusBadge tone="success">On · Monitor</StatusBadge> : <StatusBadge tone="warning">Draft</StatusBadge>}
            <Button variant="link" className="h-auto px-0" onClick={() => setRewriting(true)}>
              Write a different rule
            </Button>
          </div>
          {guard.compiled?.starter !== undefined
            ? guard.status !== "active" && <p className="text-sm text-muted-foreground">Ready: Smartplane prepared and tested this rule, so there is nothing to verify.</p>
            : guard.verify !== null && guard.status !== "active" && <VerifyCompact run={guard.verify} />}
          {guard.verify?.stage === "needs_confirmation" && (
            <p className="text-sm text-muted-foreground">
              The rule names something specific. You can pin it later in Rules.{" "}
              <Button variant="link" className="h-auto px-0" onClick={() => rules.skipPin(guard)}>Test it now</Button>
            </p>
          )}
          {rules.compileFailed && guard.verify?.stage !== "done" && (
            <Alert variant="destructive" className="animate-reveal">
              <AlertTitle>Could not verify the rule just now</AlertTitle>
              <AlertDescription>{guard.verify?.error ?? "Verify could not start."} The rule is saved as a draft; verify again, or skip and finish it from Rules.</AlertDescription>
            </Alert>
          )}
          {guard.compiled !== null && guard.status !== "active" && !verifyActive(guard.verify) && (
            <>
              <RuleTry guard={guard} sample={sample(guard)} />
              <ModeExplainer />
            </>
          )}
        </>
      )}
    </StepFrame>
  )
}
