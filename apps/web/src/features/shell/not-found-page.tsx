import { Link } from "@tanstack/react-router"
import { Compass } from "lucide-react"
import { EmptyState } from "@/components/layout/empty-state"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60svh] w-full max-w-xl items-center justify-center p-6">
      <EmptyState
        icon={Compass}
        title="Off the map"
        description="This page does not exist, or what it showed has been removed."
        action={
          <Button asChild>
            <Link to="/">Back to overview</Link>
          </Button>
        }
      />
    </div>
  )
}
