import { cn } from "@/lib/utils"

type SkeletonProps = React.ComponentProps<"div">

function Skeleton({ className, ...props }: SkeletonProps) {
	return (
		<div
		data-slot="skeleton"
		// PostVIA compat: preserve the previous default rounding. Explicit
		// rounded-* in className still wins via tailwind-merge.
		className={cn("bg-accent animate-pulse rounded-xl", className)}
			{...props}></div>
	)
}
Skeleton.displayName = "Skeleton"

export { Skeleton }
