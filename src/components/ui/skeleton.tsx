import { cn } from "@/lib/utils"

/** Shimmer placeholder. `className` controls size/shape. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton animate-shimmer rounded-input", className)} {...props} />
}
