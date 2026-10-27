import { GuardTestCase } from "@pc/domain"
import { Schema } from "effect"

/** The test form edits `arguments` as JSON text; decoding parses it into the `GuardTestCase` shape. */
export const GuardTestForm = Schema.Struct({
  ...GuardTestCase.fields,
  arguments: Schema.fromJsonString(Schema.Unknown)
})
