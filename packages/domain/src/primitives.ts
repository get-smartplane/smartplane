import { Schema } from "effect"

/** Every timestamp in the contract is UTC; JSON carries ISO-8601 strings. */
export const Timestamp = Schema.DateTimeUtc

export const Name = Schema.Trimmed.check(Schema.isBetweenLength(1, 80)).annotate({ identifier: "Name" })

export const Description = Schema.String.check(Schema.isMaxLength(2000)).annotate({ identifier: "Description" })

export const Slug = Schema.String.check(
  Schema.isMaxLength(48),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
).annotate({ identifier: "Slug" })

export const Email = Schema.String.check(
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
).annotate({ identifier: "Email" })

export const HttpUrl = Schema.String.check(Schema.isPattern(/^https?:\/\/\S+$/)).annotate({ identifier: "HttpUrl" })

export const PositiveInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))

/** A probability or threshold in [0, 1]. */
export const Probability = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))
