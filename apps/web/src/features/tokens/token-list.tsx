import { KeyRound } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { QueryView } from "@/components/query/query-view"
import { tokensAtom, type TokenScope } from "./atoms"
import { CreateTokenDialog } from "./create-token-dialog"
import { TokensTable } from "./tokens-table"

export function TokenList({ scope }: { readonly scope: TokenScope }) {
  return (
    <QueryView atom={tokensAtom(scope)}>
      {(tokens) =>
        tokens.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No access tokens"
            description="You only need one for clients without OAuth sign-in, CI jobs or service accounts."
            action={<CreateTokenDialog />}
          />
        ) : (
          <TokensTable tokens={tokens} />
        )
      }
    </QueryView>
  )
}
