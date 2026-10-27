import { useNavigate } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { useQueryData } from "@/components/query/use-query-data"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useMe } from "@/features/auth/me-context"
import { allResourcesAtom } from "@/features/resources/atoms"
import { useMutation } from "@/lib/api/use-mutation"
import { AgentConnect } from "../agent/agent-connect"
import { updateWelcomeAtom } from "../atoms"
import { FocusLayout } from "../setup/focus-layout"
import { GrantedTools } from "./granted-tools"
import { RequestAccess } from "./request-access"

/** An invited member's first sign-in: what Smartplane is, what they can reach, and how to connect. */
export function WelcomePage() {
  const { org } = useMe()
  const navigate = useNavigate()
  // Secrets are never handed to agents, so they are not "access" a member would recognise.
  const granted = useQueryData(allResourcesAtom, []).filter((resource) => resource.config.kind !== "secret")
  const update = useMutation(updateWelcomeAtom)
  const leave = async (status: "completed" | "dismissed") => {
    if ((await update.execute({ status }))._tag === "Success") await navigate({ to: "/" })
  }
  const skip = (
    <Button variant="ghost" size="sm" className="text-sky-ink hover:bg-white/45 hover:text-sky-ink dark:hover:bg-white/10" onClick={() => void leave("dismissed")}>
      Skip
    </Button>
  )
  return (
    <FocusLayout exit={skip} sparse>
      <div className="flex animate-reveal flex-col gap-10">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-[2rem] leading-9">Welcome to {org.name}</h1>
          <p className="max-w-xl text-[0.9375rem] text-pretty text-muted-foreground">
            Smartplane is the one endpoint your AI agents use to reach your company’s tools. Every call is checked against its rules, then recorded.
          </p>
        </header>
        <section aria-labelledby="welcome-access" className="flex flex-col gap-3">
          <h2 id="welcome-access" className="font-display text-lg">What you have access to</h2>
          <GrantedTools resources={granted} />
          <RequestAccess />
        </section>
        <section aria-labelledby="welcome-agent" className="flex flex-col gap-3">
          <h2 id="welcome-agent" className="font-display text-lg">Connect your agent</h2>
          <AgentConnect />
        </section>
        <div className="flex justify-end border-t pt-5">
          <Button onClick={() => void leave("completed")} disabled={update.pending}>
            {update.pending ? <Spinner /> : null}
            Go to the dashboard
            <ArrowRight />
          </Button>
        </div>
      </div>
    </FocusLayout>
  )
}
