import { ResourceId } from "@pc/domain"
import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"
import { ConnectionReturn } from "@/features/connections/connection-return"
import { OAuthReturn } from "@/features/integrations/oauth-return"
import { ResourceDetailPage } from "@/features/resources/resource-detail-page"

const decodeResourceId = Schema.decodeUnknownSync(ResourceId)

export const Route = createFileRoute("/_app/resources/$resourceId")({
  params: {
    parse: (raw) => ({ resourceId: decodeResourceId(raw.resourceId) }),
    stringify: ({ resourceId }) => ({ resourceId })
  },
  validateSearch: Schema.toStandardSchemaV1(Schema.Struct({ ...OAuthReturn.fields, ...ConnectionReturn.fields })),
  component: function ResourceRoute() {
    return <ResourceDetailPage resourceId={Route.useParams().resourceId} oauth={Route.useSearch()} connection={Route.useSearch()} />
  }
})
