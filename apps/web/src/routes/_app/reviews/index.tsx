import { createFileRoute } from "@tanstack/react-router"
import { ReviewsPage } from "@/features/reviews/reviews-page"

export const Route = createFileRoute("/_app/reviews/")({ component: ReviewsPage })
