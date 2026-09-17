import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { type VariantProps, cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

export type BadgeProps = Omit<React.HTMLAttributes<HTMLDivElement>, "color"> &
	VariantProps<typeof badgeVariants> & {
		asChild?: boolean
	}

export type BadgeDotProps = React.HTMLAttributes<HTMLSpanElement>

// PostVIA Badge — semantic colors only.
//
// History: the color axis used to span the full 17-hue foundation palette
// (red … rose) plus info/success/warning. Repo-wide usage analysis showed
// zero call sites for any of them: the product uses primary (plan markers),
// error (failure states) and neutral (default), while post statuses go
// through the StatusBadge domain gateway (status → className tints, never
// color="info|success|warning"). The unused hues and their compounds were
// removed; every remaining class set is byte-identical to before.
// Full history in docs/design-tokens.md ("Radian removal").
const badgeVariants = cva(
	"inline-flex items-center font-medium w-fit whitespace-nowrap transition duration-200 gap-0.5",
	{
		variants: {
			variant: {
				strong: "",
				outline: "",
				soft: "",
			},
			size: {
				"20": "h-5 px-1 text-xs rounded-md [&_svg]:size-3",
				"24": "h-6 px-1.5 text-label rounded-md [&_svg]:size-3.5",
			},
			color: {
				primary: "",
				error: "",
				neutral: "bg-elevation-raised border-overlay-12",
			},
		},
		defaultVariants: {
			variant: "outline",
			size: "24",
			color: "neutral",
		},
		compoundVariants: [
			// strong
			{
				variant: "strong",
				color: "primary",
				className: "bg-primary text-primary-foreground  border border-overlay-12",
			},
			{
				variant: "strong",
				color: "error",
				className: "bg-error text-error-foreground border border-overlay-12",
			},
			{
				variant: "strong",
				color: "neutral",
				className:
					"bg-foreground border border-overlay-12 text-background font-medium",
			},
			// outline
			{
				variant: "outline",
				color: "primary",
				className:
					"text-primary border border-primary bg-transparent",
			},
			{
				variant: "outline",
				color: "error",
				className: "text-error border border-error-border bg-transparent",
			},
			{
				variant: "outline",
				color: "neutral",
				className: "text-foreground border bg-transparent",
			},
			// soft
			{
				variant: "soft",
				color: "primary",
				className: "bg-accent text-primary border-overlay-8",
			},
			{
				variant: "soft",
				color: "error",
				className: "bg-error-accent text-error border-overlay-8",
			},
			{
				variant: "soft",
				color: "neutral",
				className: "bg-accent text-foreground border-overlay-8",
			},
		],
	}
)

function Badge({
	className,
	variant,
	size,
	color,
	asChild = false,
	children,
	...props
}: BadgeProps) {
	const wrappedChildren = React.Children.map(children, (child) =>
		typeof child === "string" ? <span className="px-0.5">{child}</span> : child
	)

	if (asChild) {
		return (
			<Slot
				className={cn(badgeVariants({ variant, size, color }), className)}
				{...props}>
				{children}
			</Slot>
		)
	}

	return (
		<span
			className={cn(badgeVariants({ variant, size, color }), className)}
			{...props}>
			{wrappedChildren}
		</span>
	)
}

Badge.displayName = "Badge"

function BadgeDot({ className, ...props }: BadgeDotProps) {
	return (
		<span className="flex shrink-0 p-0.75">
			<span
				data-slot="badge-dot"
				className={cn(
					"bg-muted-foreground size-1.5 shrink-0 rounded-full",
					className
				)}
				{...props}
			/>
		</span>
	)
}

export { Badge, BadgeDot, badgeVariants }
