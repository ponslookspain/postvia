import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Spinner } from "./spinner"

const buttonVariants = cva(
	"inline-flex whitespace-nowrap items-center justify-center box-border focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none hover:cursor-pointer w-fit",
	{
		variants: {
			variant: {
				strong: "",
				soft: "",
				outline: "",
				ghost: "",
				link: "",
				glossy: "",
				"glossy-inverted": "",
				smooth: "",
				"smooth-inverted": "",
			},
			size: {
				"28": "[&>svg]:size-4 text-[13px] leading-4.5 px-1 rounded-full",
				"32": "[&>svg]:size-4.5 text-sm px-1 rounded-full",
				"36": "[&>svg]:size-5 text-sm px-1 rounded-full",
				"40": "[&>svg]:size-5 text-sm px-1 rounded-full",
				"44": "[&>svg]:size-5 text-base px-1 rounded-full",
				"48": "[&>svg]:size-6 text-base px-1 rounded-full",
			},
			loading: {
				true: "",
				false: "",
			},
			color: {
				primary: "",
				info: "",
				success: "",
				error: "",
				warning: "",
				neutral: "",
			},
		},
		defaultVariants: {
			variant: "strong",
			size: "36",
			color: "primary",
			loading: false,
		},
		compoundVariants: [
			// Default size styles (for buttons with text)
			{ size: "28", className: "gap-1 h-7 px-2 py-1.5" },
			{ size: "32", className: "gap-1.5 h-8 px-2.5 py-1.5" },
			{ size: "36", className: "gap-2 h-9 px-3 py-2" },
			{ size: "40", className: "gap-2 h-10 px-3 py-2.5" },
			{ size: "44", className: "gap-2 h-11 px-3 py-2.5" },
			{ size: "48", className: "gap-2 h-12 px-4 py-3" },

			// Strong variant + colors
			{
				variant: "strong",
				color: "primary",
				className:
					"bg-primary font-medium text-primary-fg hover:bg-primary-hover focus-visible:ring-primary focus-visible:outline-none",
			},
			{
				variant: "strong",
				color: "info",
				className:
					"bg-info font-medium text-info-fg hover:bg-info-hover focus-visible:ring-info focus-visible:outline-none",
			},
			{
				variant: "strong",
				color: "success",
				className:
					"bg-success font-medium text-success-fg hover:bg-success-hover focus-visible:ring-success focus-visible:outline-none",
			},
			{
				variant: "strong",
				color: "error",
				className:
					"bg-error font-medium text-error-fg hover:bg-error-hover focus-visible:ring-error focus-visible:outline-none",
			},
			{
				variant: "strong",
				color: "warning",
				className:
					"bg-warning font-medium text-warning-fg hover:bg-warning-hover focus-visible:ring-warning focus-visible:outline-none",
			},
			{
				variant: "strong",
				color: "neutral",
				className:
					"bg-black-inverse font-medium text-white-inverse hover:bg-fg-secondary focus-visible:ring-black-inverse focus-visible:outline-none",
			},

			// Soft variant + colors
			{
				variant: "soft",
				color: "primary",
				className:
					"bg-primary-accent font-medium text-primary-text hover:bg-primary-focus focus-visible:ring-primary-focus focus-visible:outline-none",
			},
			{
				variant: "soft",
				color: "info",
				className:
					"bg-info-accent font-medium text-info-text hover:bg-info-focus focus-visible:ring-info-focus focus-visible:outline-none",
			},
			{
				variant: "soft",
				color: "success",
				className:
					"bg-success-accent font-medium text-success-text hover:bg-success-focus focus-visible:ring-success-focus focus-visible:outline-none",
			},
			{
				variant: "soft",
				color: "error",
				className:
					"bg-error-accent font-medium text-error-text hover:bg-error-focus focus-visible:ring-error-focus focus-visible:outline-none",
			},
			{
				variant: "soft",
				color: "warning",
				className:
					"bg-warning-accent font-medium text-warning-text hover:bg-warning-focus focus-visible:ring-warning-focus focus-visible:outline-none",
			},
			{
				variant: "soft",
				color: "neutral",
				className:
					"bg-fill2 font-medium text-fg hover:bg-fill3 focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-border",
			},

			// Outline variant + colors
			{
				variant: "outline",
				color: "primary",
				className:
					"bg-transparent font-medium border border-primary-border text-primary-text hover:bg-primary-accent focus-visible:ring-primary-hover",
			},
			{
				variant: "outline",
				color: "info",
				className:
					"bg-transparent font-medium border border-info-border text-info-text hover:bg-info-accent focus-visible:ring-info-hover",
			},
			{
				variant: "outline",
				color: "success",
				className:
					"bg-transparent font-medium border border-success-border text-success-text hover:bg-success-accent focus-visible:ring-success-hover",
			},
			{
				variant: "outline",
				color: "error",
				className:
					"bg-transparent font-medium border border-error-border text-error-text hover:bg-error-accent focus-visible:ring-error-hover",
			},
			{
				variant: "outline",
				color: "warning",
				className:
					"bg-transparent font-medium border border-warning-border text-warning-text hover:bg-warning-accent focus-visible:ring-warning-hover",
			},
			{
				variant: "outline",
				color: "neutral",
				className:
					"bg-elevation-level1 font-medium  text-fg border border-border hover:bg-fill1-alpha focus-visible:ring-border",
			},

			// Ghost variant + colors
			{
				variant: "ghost",
				color: "primary",
				className:
					"bg-transparent text-primary-text font-medium hover:bg-primary-focus focus-visible:outline-none focus-visible:ring-primary-focus",
			},
			{
				variant: "ghost",
				color: "info",
				className:
					"bg-transparent text-info-text font-medium hover:bg-info-focus focus-visible:outline-none focus-visible:ring-info-focus",
			},
			{
				variant: "ghost",
				color: "success",
				className:
					"bg-transparent text-success-text font-medium hover:bg-success-focus focus-visible:outline-none focus-visible:ring-success-focus",
			},
			{
				variant: "ghost",
				color: "error",
				className:
					"bg-transparent text-error-text font-medium hover:bg-error-focus focus-visible:outline-none focus-visible:ring-error-focus",
			},
			{
				variant: "ghost",
				color: "warning",
				className:
					"bg-transparent text-warning-text font-medium hover:bg-warning-focus focus-visible:outline-none focus-visible:ring-warning-focus",
			},
			{
				variant: "ghost",
				color: "neutral",
				className:
					"bg-transparent text-fg font-medium hover:bg-fill2 focus-visible:outline-none focus-visible:ring-border",
			},

			// Link variant + colors
			{
				variant: "link",
				color: "primary",
				className:
					"bg-transparent text-primary-text font-medium hover:underline focus-visible:ring-primary focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			{
				variant: "link",
				color: "info",
				className:
					"bg-transparent text-info-text font-medium hover:underline focus-visible:ring-info focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			{
				variant: "link",
				color: "success",
				className:
					"bg-transparent text-success-text font-medium hover:underline focus-visible:ring-success focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			{
				variant: "link",
				color: "error",
				className:
					"bg-transparent text-error-text font-medium hover:underline focus-visible:ring-error focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			{
				variant: "link",
				color: "warning",
				className:
					"bg-transparent text-warning-text font-medium hover:underline focus-visible:ring-warning focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},
			{
				variant: "link",
				color: "neutral",
				className:
					"bg-transparent text-black-inverse font-medium hover:underline focus-visible:ring-black-inverse focus-visible:outline-none h-auto px-0 py-0 gap-1 focus-visible:rounded-sm",
			},

			// Link variant loading state (no underline when loading)
			{
				variant: "link",
				loading: true,
				className: "hover:no-underline",
			},
		],
	}
)

type PostVIAButtonVariant =
	| "default"
	| "secondary"
	| "outline"
	| "ghost"
	| "destructive"
	| "link"

type PostVIAButtonSize =
	| "default"
	| "xs"
	| "sm"
	| "lg"
	| "icon"
	| "icon-xs"
	| "icon-sm"
	| "icon-lg"

// Legacy PostVIA API → Radian implementation. Mapping verified against all
// 146 call sites: every used variant/size pair resolves to an existing
// Radian compound (heights match 1:1: default/h-9, sm/h-8, lg/h-10).
const POSTVIA_VARIANT_MAP = {
	default: { variant: "strong", color: "primary" },
	secondary: { variant: "soft", color: "neutral" },
	outline: { variant: "outline", color: "neutral" },
	ghost: { variant: "ghost", color: "neutral" },
	destructive: { variant: "strong", color: "error" },
	link: { variant: "link", color: "primary" },
} as const

const POSTVIA_SIZE_MAP = {
	default: "36",
	xs: "28",
	sm: "32",
	lg: "40",
	icon: "36",
	"icon-xs": "28",
	"icon-sm": "32",
	"icon-lg": "44",
} as const

// Legacy size contract on top of Radian geometry: data-icon
// inline-start/end padding, icon-only squares. Radius is Radian's.
const POSTVIA_SIZE_FIXES: Record<PostVIAButtonSize, string> = {
	default:
		"has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
	xs: "has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
	sm: "has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
	lg: "has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
	icon: "aspect-square p-0",
	"icon-xs": "aspect-square p-0",
	"icon-sm": "aspect-square p-0",
	"icon-lg": "aspect-square p-0",
}

export type ButtonProps = Omit<React.ComponentProps<"button">, "color"> & {
	variant?: PostVIAButtonVariant
	size?: PostVIAButtonSize
	asChild?: boolean
	loading?: boolean
	// Legacy BaseUI composition API (Link-as-button across the app).
	// The render element becomes the Slot child; props merge the same way.
	render?: React.ReactElement
	// Legacy BaseUI prop, accepted and ignored (never rendered to the DOM).
	nativeButton?: boolean
}

function Button({
	children,
	className,
	variant = "default",
	size = "default",
	asChild = false,
	loading = false,
	render,
	...props
}: ButtonProps) {
	const mapped = POSTVIA_VARIANT_MAP[variant]
	const classes = cn(
		// Preserved PostVIA base contract (previous implementation).
		"shrink-0 border border-transparent bg-clip-padding select-none active:not-aria-[haspopup]:translate-y-px aria-invalid:border-error aria-invalid:ring-[3px] aria-invalid:ring-error/20 dark:aria-invalid:border-error/50 dark:aria-invalid:ring-error/40",
		buttonVariants({
			variant: mapped.variant,
			size: POSTVIA_SIZE_MAP[size],
			color: mapped.color,
			loading,
		}),
		// PostVIA geometry (design-system.md): buttons are always fully
		// rounded pills. Radius lives in the size variants above
		// (rounded-full on every size), never as a per-call className.
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		"aria-expanded:bg-muted aria-expanded:text-foreground",
		"disabled:opacity-50",
		POSTVIA_SIZE_FIXES[size],
		className
	)

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { nativeButton, ...validProps } = props

	if (render && React.isValidElement(render)) {
		const rendered = React.cloneElement(
			render as React.ReactElement<{ children?: React.ReactNode }>,
			{ children }
		)
		return (
			<Slot data-slot="button" {...validProps} className={classes}>
				{rendered}
			</Slot>
		)
	}

	if (asChild) {
		return (
			<Slot data-slot="button" className={classes} {...validProps}>
				{children}
			</Slot>
		)
	}

	return (
		<button data-slot="button" className={classes} {...validProps}>
			{loading && (
				<Spinner variant="simple" size={Number(POSTVIA_SIZE_MAP[size])} />
			)}
			{children}
		</button>
	)
}
Button.displayName = "Button"

export { Button, buttonVariants }
