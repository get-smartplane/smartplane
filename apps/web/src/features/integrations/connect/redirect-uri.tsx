import { CopyButton } from "@/components/form/copy-button"
import { useQueryData } from "@/components/query/use-query-data"
import { Skeleton } from "@/components/ui/skeleton"
import { oauthSettingsAtom } from "../atoms"
import { redirectHint } from "./provider-hints"

/** The one value people must copy to the provider before signing in works; shown verbatim, with where it goes. */
interface RedirectUriProps {
  readonly pieceId: string
  readonly pieceName: string
  readonly title?: string
}

export function RedirectUri({ pieceId, pieceName, title = "Redirect URI to register" }: RedirectUriProps) {
  const settings = useQueryData(oauthSettingsAtom, null)
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        {settings && <CopyButton text={settings.redirectUri} />}
      </div>
      {settings ? (
        <code className="rounded-md bg-muted px-2.5 py-1.5 text-xs break-all select-all">{settings.redirectUri}</code>
      ) : (
        <Skeleton className="h-7 w-full" />
      )}
      <p className="text-xs text-pretty text-muted-foreground">{redirectHint(pieceId, pieceName)}</p>
    </div>
  )
}
