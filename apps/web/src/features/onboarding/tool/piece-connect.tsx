import { PieceId } from "@pc/domain"
import { Plug } from "lucide-react"
import { QueryView } from "@/components/query/query-view"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { pieceAtom } from "@/features/integrations/atoms"
import { ConnectDialog } from "@/features/integrations/connect/connect-dialog"
import type { Connected } from "@/features/integrations/connect/use-connect"
import type { PopularPiece } from "./tool-options"

interface PieceConnectProps {
  readonly pieceId: PopularPiece
  readonly onConnected: (connected: Connected) => void
}

/** The catalog's own connect dialog; OAuth2 sign-in comes back to this step rather than the tool's page. */
export function PieceConnect({ pieceId, onConnected }: PieceConnectProps) {
  return (
    <QueryView atom={pieceAtom(PieceId.make(pieceId))} loading={<Skeleton className="h-9 w-40" />}>
      {(piece) => (
        <ConnectDialog
          piece={piece}
          returnTo="setup"
          onConnected={onConnected}
          trigger={
            <Button className="w-fit">
              <Plug />
              Connect {piece.displayName}
            </Button>
          }
        />
      )}
    </QueryView>
  )
}
