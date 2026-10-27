import { IntegrationCatalog } from "@pc/domain"
import { Effect, Schema } from "effect"
import generated from "./generated/catalog.json"

/** The generated manifest is data like any other input: apps decode it once, with the domain schema. */
export const decodeCatalog: Effect.Effect<IntegrationCatalog> = Schema.decodeUnknownEffect(IntegrationCatalog)(generated).pipe(
  Effect.orDie,
  Effect.withSpan("IntegrationCatalog.decode")
)
