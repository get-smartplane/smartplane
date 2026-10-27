import type { DeliveryDenialReason } from "@pc/domain"

export {
  DeliveredSecrets,
  type DeliveredKind,
  DeliverSecretsRequest,
  DeliveryDenial,
  type DeliveryDenialReason,
  DeliveryPurpose
} from "@pc/domain"

export const describeDenial: Record<DeliveryDenialReason, string> = {
  not_deliverable: "not deliverable",
  no_grant: "no grant",
  unknown: "unknown",
  policy: "denied by policy"
}
