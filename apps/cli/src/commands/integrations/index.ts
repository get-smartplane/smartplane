import { IntegrationPiece, IntegrationPieceSummary, PieceId } from "@pc/domain"
import { Effect, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import { api } from "../../api/client"
import { field } from "../../app/common-flags"
import { emit } from "../../app/output"
import { details, tableOr } from "../../app/table"

const authLabel = (types: ReadonlyArray<string>) => types.map((type) => type.replace("_", "-")).join(",")

const catalogTable = (pieces: ReadonlyArray<IntegrationPieceSummary>) =>
  tableOr(
    "No integrations match.",
    ["piece", "name", "auth", "actions", "categories"],
    pieces.map((p) => [p.id, p.displayName, authLabel(p.authTypes), `${p.supportedActionCount}/${p.actionCount}`, p.categories.join(",")])
  )

const pieceDetails = (piece: IntegrationPiece) =>
  [
    details([
      ["piece", piece.id],
      ["name", piece.displayName],
      ["version", `${piece.packageName}@${piece.version}`],
      ["auth", authLabel(piece.authTypes)],
      ["about", piece.description]
    ]),
    "",
    tableOr(
      "No actions.",
      ["action", "needs", "kind", "status", "description"],
      piece.actions.map((a) => [a.name, a.requiredAction, a.classification, a.support.status, a.displayName])
    )
  ].join("\n")

const listCatalog = Command.make("ls", {
  search: Flag.String("search").pipe(Flag.withAlias("s"), Flag.withDescription("Match id, name, description or category"), Flag.optional),
  category: Flag.String("category").pipe(Flag.withDescription("Only this category"), Flag.optional)
}, (flags) =>
  Effect.gen(function*() {
    const client = yield* api
    const pieces = yield* client.integrations.listCatalog({ query: { ...field("search", flags.search), ...field("category", flags.category) } })
    yield* emit(Schema.Array(IntegrationPieceSummary), pieces, catalogTable)
  })).pipe(Command.withDescription("Browse the integrations catalog"), Command.withAlias("list"))

const showPiece = Command.make("show", {
  piece: Argument.String("piece").pipe(Argument.withSchema(PieceId), Argument.withDescription("Piece id, e.g. github"))
}, ({ piece }) =>
  Effect.gen(function*() {
    const client = yield* api
    yield* emit(IntegrationPiece, yield* client.integrations.getPiece({ params: { pieceId: piece } }), pieceDetails)
  })).pipe(Command.withDescription("Show a piece's connection methods and actions"))

export const integrations = Command.make("integrations").pipe(
  Command.withDescription("Browse the catalog of integrations Smartplane can run"),
  Command.withSubcommands([listCatalog, showPiece])
)
