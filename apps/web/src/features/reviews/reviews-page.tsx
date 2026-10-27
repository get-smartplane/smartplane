import { ClipboardCheck } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Page } from "@/components/layout/page"
import { PageHeader } from "@/components/layout/page-header"
import { QueryView } from "@/components/query/query-view"
import { reviewsAtom } from "./atoms"
import { CreateReviewDialog } from "./create-review-dialog"
import { ReviewsTable } from "./reviews-table"

export function ReviewsPage() {
  return (
    <Page>
      <PageHeader
        title="Access reviews"
        description="Confirm, every quarter, that everyone still needs the access they have. Nobody decides on their own."
        actions={<CreateReviewDialog />}
      />
      <QueryView atom={reviewsAtom}>
        {(reviews) =>
          reviews.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Run your first access review"
              description="It lists every membership and grant in scope. Keep or revoke each, then close it and export the CSV for your auditor."
              hint="SOC 2 asks for this (CC6.2, CC6.3), usually once a quarter."
              action={<CreateReviewDialog />}
            />
          ) : (
            <ReviewsTable reviews={reviews} />
          )
        }
      </QueryView>
    </Page>
  )
}
