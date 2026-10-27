import { Link } from "@tanstack/react-router"
import { Check, LayoutDashboard, Minus, ScrollText, ShieldCheck, Users } from "lucide-react"
import { useEffect, useRef } from "react"
import { PaperPlane } from "@/components/sky/paper-plane"
import { Button } from "@/components/ui/button"
import "../sky/moments.css"
import { setupSteps } from "./steps"
import type { SetupController } from "./use-setup"
import { useSetupTool } from "./use-setup-tool"

const links = [
  { to: "/guards", label: "Rules", icon: ShieldCheck, text: "Switch a rule to Block once its flags look right." },
  { to: "/audit", label: "Audit log", icon: ScrollText, text: "Every call, allowed or not, hash-chained." },
  { to: "/members", label: "Members", icon: Users, text: "Invite people and change roles." }
] as const

/** The summary: what was set up, what was skipped (and stays on the overview checklist), and where to go next. */
export function DoneStep({ controller }: { readonly controller: SetupController }) {
  const { setup, save } = controller
  const tool = useSetupTool(setup)
  const completed = useRef(false)
  useEffect(() => {
    if (completed.current || setup.status !== "open") return
    completed.current = true
    void save({ status: "completed" })
  }, [setup.status, save])
  const skipped = setupSteps.filter((step) => setup.steps[step.id] !== "done").length

  return (
    <section aria-labelledby="setup-done-title" className="flex animate-reveal flex-col gap-8">
      <div className="relative h-16 overflow-visible" aria-hidden="true">
        <PaperPlane className="onb-flyoff absolute top-3 left-0 w-20 rotate-6" strokeWidth={4} />
      </div>
      <header className="flex flex-col gap-2">
        <h1 id="setup-done-title" className="font-display text-[2rem] leading-9">You are set up</h1>
        <p className="max-w-xl text-[0.9375rem] text-pretty text-muted-foreground">
          {skipped === 0 ? "Every agent call now goes through one endpoint, is checked against your rules, and is recorded." : skipped === 1 ? "One step was skipped. You can finish it any time from the overview." : `${skipped} steps were skipped. You can finish them any time from the overview.`}
        </p>
      </header>
      <ul className="flex flex-col divide-y rounded-xl border">
        {setupSteps.map((step) => {
          const done = setup.steps[step.id] === "done"
          return (
            <li key={step.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              {done ? <Check className="size-4 text-brand" aria-label="Done" /> : <Minus className="size-4 text-muted-foreground" aria-label="Skipped" />}
              <span className={done ? "font-medium" : "text-muted-foreground"}>{step.title}</span>
              {step.id === "tool" && tool && <span className="ml-auto truncate text-muted-foreground">{tool.name}</span>}
            </li>
          )
        })}
      </ul>
      <div className="grid gap-2 sm:grid-cols-3">
        {links.map(({ to, label, icon: Icon, text }) => (
          <Link key={to} to={to} className="flex flex-col gap-1 rounded-xl border p-4 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {label}
            </span>
            <span className="text-xs text-muted-foreground">{text}</span>
          </Link>
        ))}
      </div>
      <Button className="w-fit" asChild>
        <Link to="/">
          <LayoutDashboard />
          Go to the dashboard
        </Link>
      </Button>
    </section>
  )
}
