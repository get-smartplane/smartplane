import type { AccountMode, CatalogServerConnected, McpCatalogEntry, OAuthReturnTo } from "@pc/domain"
import { Redacted } from "effect"
import { ArrowUpRight, Info, LogIn, Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { ChoiceCards } from "@/components/form/choice-cards"
import { FormField } from "@/components/form/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useMutation } from "@/lib/api/use-mutation"
import { connectCatalogAtom } from "./atoms"
import { ServerHeading } from "./server-heading"

const accountChoices = [
  { value: "shared", label: "One shared account", description: "You sign in once; everyone you grant uses it." },
  { value: "per_user", label: "Each person's own", description: "Members sign in themselves the first time they use it." }
] as const

interface CatalogConnectFormProps {
  readonly entry: McpCatalogEntry
  readonly returnTo?: OAuthReturnTo
  readonly onConnected: (connected: CatalogServerConnected) => void
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "")

/**
 * The whole of connecting an official server: what it is, whose account, then Connect. Shared OAuth continues
 * at the provider's sign-in; per-user and token servers are done here.
 */
export function CatalogConnectForm({ entry, returnTo, onConnected }: CatalogConnectFormProps) {
  const [mode, setMode] = useState<AccountMode>("shared")
  const [token, setToken] = useState("")
  const [tokenError, setTokenError] = useState<string>()
  const connect = useMutation(connectCatalogAtom)
  const needsToken = entry.auth === "token" && mode === "shared"
  const signsIn = entry.auth === "oauth-dcr" && mode === "shared"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (needsToken && token.trim() === "") return setTokenError(`Paste a ${entry.vendor} personal access token.`)
    setTokenError(undefined)
    const outcome = await connect.execute({
      slug: entry.slug,
      accountMode: mode,
      ...(returnTo === undefined ? {} : { returnTo }),
      ...(needsToken ? { token: Redacted.make(token.trim()) } : {})
    })
    // Stored or refused, the typed token has no reason to stay in memory.
    setToken("")
    if (outcome._tag === "Success") onConnected(outcome.value)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <ServerHeading entry={entry} />
      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What it can do</h3>
        <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {entry.capabilities.map((capability) => (
            <li key={capability} className="flex items-baseline gap-2">
              <span aria-hidden="true" className="size-1 shrink-0 translate-y-[-0.2em] rounded-full bg-brand" />
              {capability}
            </li>
          ))}
        </ul>
      </div>
      {entry.notes && (
        <p className="flex gap-2 rounded-md bg-muted/70 px-3 py-2 text-sm text-pretty text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {entry.notes}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Whose account?</p>
        <ChoiceCards label="Whose account" choices={accountChoices} value={mode} onChange={setMode} columns={2} />
      </div>
      {needsToken && (
        <FormField id="catalog-token" label="Personal access token" error={tokenError} description="Encrypted at rest; agents never see it.">
          <Input id="catalog-token" type="password" autoComplete="off" value={token} aria-invalid={tokenError !== undefined} onChange={(event) => setToken(event.target.value)} />
        </FormField>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" disabled={connect.pending}>
          {connect.pending ? <Spinner /> : signsIn ? <LogIn /> : <Plus />}
          {signsIn ? `Connect with ${entry.vendor}` : mode === "per_user" ? `Add ${entry.name}` : "Connect"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {signsIn ? `You sign in at ${hostOf(entry.url)}, then come straight back.` : mode === "per_user" ? "Nobody signs in now; members connect on first use." : null}
        </span>
        <a href={entry.docsUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
          {entry.vendor} docs
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </div>
    </form>
  )
}
