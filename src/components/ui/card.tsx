import * as React from "react"
import { cn } from "@/lib/utils"

function Card({
	className,
	// PostVIA compat: previous Card had size default|sm (spacing 6|4).
	// Geometry is preserved via data-size selectors below so the 11
	// size="sm" call sites keep working unchanged.
	size = "default",
	...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
	return (
		<div
			data-slot="card"
			data-size={size}
			className={cn(
				// PostVIA surface rule: blocks are separated by tone, not by a
				// drawn box — a panel one shade off the page, no outline. The
				// transparent border keeps the geometry (and lets a caller opt
				// into a colored one, e.g. border-error on a destructive card).
				"bg-panel text-fg text-sm flex flex-col gap-6 overflow-hidden rounded-2xl border border-transparent py-6",
				"data-[size=sm]:gap-4 data-[size=sm]:py-4",
				"data-[size=sm]:[&_[data-slot=card-header]]:px-4",
				"data-[size=sm]:[&_[data-slot=card-header]]:[.border-b]:pb-4",
				"data-[size=sm]:[&_[data-slot=card-content]]:px-4",
				"data-[size=sm]:[&_[data-slot=card-footer]]:px-4",
				"data-[size=sm]:[&_[data-slot=card-footer]]:[.border-t]:pt-4",
				className
			)}
			{...props}
		/>
	)
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-header"
			// PostVIA compat: previous header kept rounded-t-xl.
			className={cn(
				"@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 rounded-t-xl px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
				className
			)}
			{...props}
		/>
	)
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-title"
			// PostVIA compat: previous title was font-heading text-base.
			// (Upstream uses the heading-6 utility, not installed here.)
			className={cn("font-heading text-base font-medium", className)}
			{...props}
		/>
	)
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-description"
			className={cn("text-fg-secondary text-sm", className)}
			{...props}
		/>
	)
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-action"
			className={cn(
				"col-start-2 row-span-2 row-start-1 self-start justify-self-end",
				className
			)}
			{...props}
		/>
	)
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-content"
			className={cn("px-6", className)}
			{...props}
		/>
	)
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="card-footer"
			// PostVIA compat: previous footer kept rounded-b-xl.
			className={cn(
				"flex items-center rounded-b-xl px-6 [.border-t]:pt-6",
				className
			)}
			{...props}
		/>
	)
}

export {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardAction,
	CardDescription,
	CardContent,
}
