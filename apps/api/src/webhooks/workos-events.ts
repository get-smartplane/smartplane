import { Schema } from "effect"

/** Raw WorkOS webhook payloads (snake_case JSON), for the events that drive on- and offboarding. */
const Membership = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  organization_id: Schema.String,
  status: Schema.String,
  role: Schema.optional(Schema.NullOr(Schema.Struct({ slug: Schema.String })))
})

const DirectoryUser = Schema.Struct({
  organization_id: Schema.optional(Schema.NullOr(Schema.String)),
  state: Schema.optional(Schema.String),
  email: Schema.optional(Schema.NullOr(Schema.String)),
  emails: Schema.optional(Schema.Array(Schema.Struct({ value: Schema.String, primary: Schema.optional(Schema.Boolean) })))
})

export const WorkosEvent = Schema.Union([
  Schema.Struct({
    event: Schema.Literals(["organization_membership.created", "organization_membership.updated", "organization_membership.deleted"]),
    data: Membership
  }),
  Schema.Struct({ event: Schema.Literals(["dsync.user.updated", "dsync.user.deleted"]), data: DirectoryUser }),
  Schema.Struct({ event: Schema.Literal("user.deleted"), data: Schema.Struct({ id: Schema.String }) })
])
export type WorkosEvent = typeof WorkosEvent.Type

export const HandledEvents: ReadonlySet<string> = new Set([
  "organization_membership.created",
  "organization_membership.updated",
  "organization_membership.deleted",
  "dsync.user.updated",
  "dsync.user.deleted",
  "user.deleted"
])

export const EventEnvelope = Schema.Struct({ id: Schema.optional(Schema.String), event: Schema.String })

export const directoryEmails = (user: typeof DirectoryUser.Type): ReadonlyArray<string> => [
  ...(user.email ? [user.email] : []),
  ...(user.emails ?? []).map((email) => email.value)
]
