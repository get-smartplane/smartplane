const steps = [
  { title: "You become the owner", text: "Full control, including SSO, directory sync and custom roles." },
  { title: "Bring your people", text: "Invite by email or connect SCIM so joiners and leavers sync on their own." },
  { title: "Add what agents may reach", text: "MCP servers, databases, APIs and sealed secrets. Nothing is reachable until granted." },
  { title: "Hand out one endpoint", text: "Each person connects their MCP client once; access ends with their membership." }
] as const

/** What creating the org sets in motion, as a path rather than a feature list. */
export function OnboardingAside() {
  return (
    <div className="flex max-w-lg flex-col gap-8">
      <p className="font-display text-[2.75rem] leading-[1] font-[700] tracking-[-0.04em] text-balance">From an empty org to governed agents.</p>
      <ol data-ui className="flex flex-col divide-y divide-border/80 overflow-hidden rounded-lg bg-card text-card-foreground ring-[1.5px] ring-plane-line dark:ring-border">
        {steps.map(({ title, text }, index) => (
          <li key={title} className="flex gap-3 px-4 py-3">
            <span
              aria-hidden="true"
              className={
                index === 0
                  ? "mt-1 size-2.5 shrink-0 rounded-full bg-brand"
                  : "mt-1 size-2.5 shrink-0 rounded-full ring-[1.5px] ring-muted-foreground/50 ring-inset"
              }
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
