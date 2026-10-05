import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-input border border-border bg-surface px-3 py-1.5 text-sm text-foreground",
        "placeholder:text-subtle/70 transition-colors duration-150 ease-ui",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50 max-md:h-11",
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input }
