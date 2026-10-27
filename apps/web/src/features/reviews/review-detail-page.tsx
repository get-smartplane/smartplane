import type { AccessReviewId } from "@pc/domain"
import { BackLink } from "@/components/layout/back-link"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { reviewAtom } from "./atoms"
import { CloseReviewButton } from "./close-review-button"
import { ExportReviewButton } from "./export-review-button"
import { ReviewItemsSection } from "./review-items-section"
import { ReviewMachineTokens } from "./review-machine-tokens"
import { ReviewStatusBadge } from "./review-status-badge"
import { ReviewSummary } from "./review-summary"
import { ScopeLabel } from "./scope-label"

export function ReviewDetailPage({ reviewId }: { readonly reviewId: AccessReviewId }) {
  return (
    <Page>
      <QueryView atom={reviewAtom(reviewId)}>
        {({ review, items, machineTokens }) => (
          <div className="flex flex-col gap-6">
            <PageHeader
              back={<BackLink to="/reviews">Access reviews</BackLink>}
              title={review.name}
              status={<ReviewStatusBadge review={review} />}
              description={<ScopeLabel scope={review.scope} />}
              actions={review.status === "open" ? <CloseReviewButton review={review} /> : <ExportReviewButton review={review} />}
            />
            <ReviewSummary review={review} items={items} />
            <ReviewItemsSection
              title="People"
              description="Revoking offboards the person: membership, tokens, direct grants and teams."
              review={review}
              items={items.filter((item) => item.access._tag === "Membership")}
            />
            <ReviewItemsSection
              title="Grants"
              description="Revoking removes the grant; agents lose it on their next call."
              review={review}
              items={items.filter((item) => item.access._tag === "Grant")}
            />
            <ReviewMachineTokens tokens={machineTokens} />
          </div>
        )}
      </QueryView>
    </Page>
  )
}
