import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

// PostVIA Button — direct contract.
//
// History: this used to be a two-layer mapping (PostVIA variant/size names
// translated through POSTVIA_VARIANT_MAP / POSTVIA_SIZE_MAP /
	// POSTVIA_SIZE_FIXES onto an internal variant + color + numeric-size
// axis). The mapping is inlined below so there is one cva layer. Every
// variant/size class set is byte-identical to what the mapping produced —
// verified against all call sites (default/h-9, sm/h-8, lg/h-10).
// Full history in docs/design-tokens.md ("Radian removal").
const buttonVariants = cva(
	"inline-flex whitespace-nowrap items-center justify-center box-border focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none hover:cursor-pointer w-fit",
	{
		variants: {
			variant: {
				// Primary action. PostVIA Blue.
				default:
					"bg-primary font-medium text-primary-foreground hover:brightness-95 dark:hover:brightness-110 focus-visible:ring-primary focus-visible:outline-none",
				// Quiet neutral fill.
				secondary:
					"bg-muted font-medium text-foreground hover:bg-muted focus-visible:bg-background focus-visible:outline-none focus-visible:ring-border",
				// Raised surface with a hairline.
				outline:
					"bg-card font-medium text-foreground border border-border hover:bg-overlay-4 focus-visible:ring-border",
				// Borderless action.
				ghost:
					"bg-transparent text-foreground font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-border",
				// Destructive action. Maps to the semantic error hue.
				destructive:
					"bg-error font-medium text-error-foreground hover:bg-error-hover focus-visible:ring-error focus-visible:outline-none",
				// Inline text action. Sizes only set the icon rhythm here;
				// geometry is h-auto with no padding (see below).
				link: "bg-transparent text-primary font-medium hover:underline focus-visible:ring-primary focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			size: {
				default:
					"[&>svg]:size-5 text-sm px-1 rounded-full gap-2 h-9 px-3 py-2 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
				sm: "[&>svg]:size-4.5 text-sm px-1 rounded-full gap-1.5 h-8 px-2.5 py-1.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				lg: "[&>svg]:size-5 text-sm px-1 rounded-full gap-2 h-10 px-3 py-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				"icon-sm":
					"[&>svg]:size-4.5 text-sm px-1 rounded-full gap-1.5 h-8 px-2.5 py-1.5 aspect-square p-0",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
)

type PostVIAButtonVariant =
	| "default"
	| "secondary"
	| "outline"
	| "ghost"
	| "destructive"
	| "link"

type PostVIAButtonSize = "default" | "sm" | "lg" | "icon-sm"

export type ButtonProps = Omit<React.ComponentProps<"button">, "color"> & {
	variant?: PostVIAButtonVariant
	size?: PostVIAButtonSize
	// Composition for non-button children (e.g. a Next.js Link rendered
	// with button styling). The child receives the classes via Slot.
	asChild?: boolean
}

function Button({
	children,
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: ButtonProps) {
	const classes = cn(
		// Preserved PostVIA base contract (previous implementation).
		"shrink-0 border border-transparent bg-clip-padding select-none active:not-aria-[haspopup]:translate-y-px aria-invalid:border-error aria-invalid:ring-[3px] aria-invalid:ring-error/20 dark:aria-invalid:border-error/50 dark:aria-invalid:ring-error/40",
		buttonVariants({
			variant,
			size,
		}),
		// PostVIA geometry (design-system.md): buttons are always fully
		// rounded pills. Radius lives in the size variants above
		// (rounded-full on every size), never as a per-call className.
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		"aria-expanded:bg-muted aria-expanded:text-foreground",
		"disabled:opacity-50",
		className
	)

	if (asChild) {
		return (
			<Slot data-slot="button" className={classes} {...props}>
				{children}
			</Slot>
		)
	}

	return (
		<button data-slot="button" className={classes} {...props}>
			{children}
		</button>
	)
}
Button.displayName = "Button"

export { Button, buttonVariants }
