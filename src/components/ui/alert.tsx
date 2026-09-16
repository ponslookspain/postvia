import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export type AlertProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"color" | "variant"
> &
	VariantProps<typeof alertVariants> & {
		close?: boolean
		onClose?: () => void
	}

export type AlertTitleProps = React.HTMLAttributes<HTMLHeadingElement>
export type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>
export type AlertContentProps = React.HTMLAttributes<HTMLDivElement>
export type AlertIconProps = React.HTMLAttributes<HTMLDivElement>
export type AlertToolbarProps = React.HTMLAttributes<HTMLDivElement>

const alertVariants = cva(
	// PostVIA compat: consumers render bare lucide icons as direct
	// children (no AlertIcon wrapper); keep the previous 16px sizing.
	"flex items-stretch w-full gap-3 p-3 rounded-lg [&>svg:not([class*='size-'])]:size-4 [&>[data-slot=alert-title]]:font-medium [&>[data-slot=alert-title]]:text-sm [&>[data-slot=alert-title]]:mt-0.75 [&>[data-slot=alert-description]]:text-sm  [&>[data-slot=alert-icon]>svg]:size-5 [&_[data-slot=alert-icon]]:mt-0.75 [&_[data-slot=alert-close]]:mt-0.75",
	{
		variants: {
			color: {
				neutral: "",
				primary: "",
				info: "",
				success: "",
				error: "",
				warning: "",
			},
			variant: {
				strong: "",
				soft: "[&_[data-slot=alert-title]]:text-foreground [&_[data-slot=alert-description]]:text-foreground",
				"soft-outline":
					"ring-1 ring-inset [&_[data-slot=alert-title]]:text-foreground [&_[data-slot=alert-description]]:text-foreground",
				outline:
					"border border-accent [&_[data-slot=alert-close]]:text-muted-foreground [&_[data-slot=alert-title]]:text-foreground [&_[data-slot=alert-description]]:text-foreground",
			},
		},
		compoundVariants: [
			// Soft variants
			{ color: "neutral", variant: "soft", className: "bg-accent" },
			{
				color: "primary",
				variant: "soft",
				className: "bg-accent text-primary",
			},
			{
				color: "info",
				variant: "soft",
				className: "bg-info-accent text-info-text",
			},
			{
				color: "success",
				variant: "soft",
				className: "bg-success-accent text-success",
			},
			{
				color: "error",
				variant: "soft",
				className: "bg-error-accent text-error",
			},
			{
				color: "warning",
				variant: "soft",
				className: "bg-warning-accent text-warning",
			},

			// Strong variants
			{
				color: "neutral",
				variant: "strong",
				className: "bg-foreground text-background",
			},
			{
				color: "primary",
				variant: "strong",
				className: "bg-primary text-primary-foreground",
			},
			{ color: "info", variant: "strong", className: "bg-info text-info-foreground" },
		{
			color: "warning",
			variant: "strong",
			className: "bg-warning text-warning-foreground",
		},
		{ color: "error", variant: "strong", className: "bg-error text-error-foreground" },
		{
			color: "success",
			variant: "strong",
			className: "bg-success text-success-foreground",
		},

			// Soft-outline variants
			{
				color: "neutral",
				variant: "soft-outline",
				className: "border-border bg-accent",
			},
			{
				color: "primary",
				variant: "soft-outline",
				className: "bg-accent text-primary border-primary",
			},
			{
				color: "info",
				variant: "soft-outline",
				className: "bg-info-accent text-info-text border-info-border",
			},
			{
				color: "success",
				variant: "soft-outline",
				className: "bg-success-accent text-success border-success-border",
			},
			{
				color: "error",
				variant: "soft-outline",
				className: "bg-error-accent text-error border-error-border",
			},
			{
				color: "warning",
				variant: "soft-outline",
				className: "bg-warning-accent text-warning border-warning-border",
			},

			// Outline variants
			{
				color: "neutral",
				variant: "outline",
				className: "bg-transparent text-foreground ",
			},
			{
				color: "primary",
				variant: "outline",
				className: "bg-transparent text-primary",
			},
			{
				color: "info",
				variant: "outline",
				className: "bg-transparent text-info-text",
			},
			{
				color: "success",
				variant: "outline",
				className: "bg-transparent text-success",
			},
			{
				color: "error",
				variant: "outline",
				className: "bg-transparent text-error",
			},
			{
				color: "warning",
				variant: "outline",
				className: "bg-transparent text-warning",
			},
		],
		defaultVariants: {
			color: "primary",
			variant: "soft",
		},
	}
)

function Alert({
	className,
	color = "primary",
	variant = "soft",
	close = false,
	onClose,
	children,
	...props
}: AlertProps) {
	return (
		<div
			data-slot="alert"
			role="alert"
			className={cn(alertVariants({ color, variant }), className)}
			{...props}>
			{children}
			{close && (
				<button
					onClick={onClose}
					aria-label="Dismiss"
					data-slot="alert-close"
					className={cn(
						"group flex size-5 shrink-0 cursor-pointer items-center justify-center"
					)}>
					<X className="size-4 opacity-60 group-hover:opacity-100" />
				</button>
			)}
		</div>
	)
}

Alert.displayName = "Alert"

function AlertTitle({ className, ...props }: AlertTitleProps) {
	return (
		<div data-slot="alert-title" className={cn("grow", className)} {...props} />
	)
}

AlertTitle.displayName = "AlertTitle"

function AlertIcon({ children, className, ...props }: AlertIconProps) {
	return (
		<div
			data-slot="alert-icon"
			className={cn("shrink-0", className)}
			{...props}>
			{children}
		</div>
	)
}
AlertIcon.displayName = "AlertIcon"

function AlertToolbar({ children, className, ...props }: AlertToolbarProps) {
	return (
		<div data-slot="alert-toolbar" className={cn(className)} {...props}>
			{children}
		</div>
	)
}
AlertToolbar.displayName = "AlertToolbar"

function AlertDescription({ className, ...props }: AlertDescriptionProps) {
	return (
		<div
			data-slot="alert-description"
			className={cn("text-sm [&_p]:mb-2 [&_p]:leading-relaxed", className)}
			{...props}
		/>
	)
}
AlertDescription.displayName = "AlertDescription"

function AlertContent({ className, ...props }: AlertContentProps) {
	return (
		<div
			data-slot="alert-content"
			className={cn(
				"flex grow flex-col justify-center gap-1 [&>[data-slot=alert-description]]:text-sm [&>[data-slot=alert-title]]:text-sm [&>[data-slot=alert-title]]:font-medium",
				className
			)}
			{...props}
		/>
	)
}
AlertContent.displayName = "AlertContent"

export {
	Alert,
	AlertContent,
	AlertDescription,
	AlertIcon,
	AlertTitle,
	AlertToolbar,
	alertVariants,
}
