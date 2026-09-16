"use client"

import React, { createContext, useContext } from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { type VariantProps, cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

export type AvatarProps = React.ComponentProps<typeof AvatarPrimitive.Root> & {
	size?: NonNullable<VariantProps<typeof avatarVariants>["size"]>
	rounded?: NonNullable<VariantProps<typeof avatarVariants>["rounded"]>
}
export type AvatarImageProps = React.ComponentProps<
	typeof AvatarPrimitive.Image
>
export type AvatarFallbackProps = React.ComponentProps<
	typeof AvatarPrimitive.Fallback
> &
	VariantProps<typeof avatarFallbackVariants>
export type AvatarIndicatorProps = React.HTMLAttributes<HTMLDivElement>

export type AvatarStatusProps = React.HTMLAttributes<HTMLDivElement> &
	VariantProps<typeof avatarStatusVariants>

export type AvatarContextValue = {
	size: NonNullable<VariantProps<typeof avatarVariants>["size"]>
	rounded: NonNullable<VariantProps<typeof avatarVariants>["rounded"]>
}

const AvatarContext = createContext<AvatarContextValue | null>(null)

function useAvatarContext() {
	const context = useContext(AvatarContext)
	if (!context) {
		throw new Error("Avatar components must be used within an Avatar")
	}
	return context
}

const avatarVariants = cva(
	"flex items-center font-semibold justify-center shrink-0 relative",
	{
		variants: {
			size: {
				"16": "size-4 text-xs",
				"20": "size-5 text-xs",
				"24": "size-6 text-xs",
				"32": "size-8 text-sm",
				"36": "size-9 text-sm",
				"40": "size-10 text-sm",
				"48": "size-12 text-base",
				"64": "size-16 text-xl",
				"80": "size-20 text-2xl",
				"120": "size-30 border-2",
			},
			rounded: {
				circle: "rounded-full",
				square: "",
			},
		},
		compoundVariants: [
			{ size: "16", rounded: "square", class: "rounded-sm" },
			{ size: "20", rounded: "square", class: "rounded-sm" },
			{ size: "24", rounded: "square", class: "rounded-md" },
			{ size: "32", rounded: "square", class: "rounded-md" },
			{ size: "36", rounded: "square", class: "rounded-lg" },
			{ size: "40", rounded: "square", class: "rounded-lg" },
			{ size: "48", rounded: "square", class: "rounded-lg" },
			{ size: "64", rounded: "square", class: "rounded-xl" },
			{ size: "80", rounded: "square", class: "rounded-2xl" },
		],
		defaultVariants: {
			// PostVIA compat: previous Avatar defaulted to 32px (size-8).
			size: "32",
			rounded: "circle",
		},
	}
)

const avatarStatusVariants = cva(
	"absolute z-10 border-bg rounded-full box-content",
	{
		variants: {
			variant: {
				online: "bg-success",
				offline: "bg-fg-disabled",
				busy: "bg-warning",
				away: "bg-info",
			},
			size: {
				"16": "size-1 border",
				"20": "size-1 border",
				"24": "size-1.5 border-2",
				"32": "size-1.5 border-2",
				"36": "size-1.5 border-2",
				"40": "size-2 border-2",
				"48": "size-3 border-2",
				"64": "size-3 border-2",
				"80": "size-4 border-2",
				"120": "size-6 border-2",
			},
		},
		defaultVariants: {
			variant: "online",
			size: "40",
		},
	}
)

const avatarFallbackVariants = cva("", {
	variants: {
		color: {
			red: "bg-red-accent text-red-text",
			orange: "bg-orange-accent text-orange-text",
			amber: "bg-amber-accent text-amber-text",
			yellow: "bg-yellow-accent text-yellow-text",
			neon: "bg-neon-accent text-neon-text",
			green: "bg-green-accent text-green-text",
			emerald: "bg-emerald-accent text-emerald-text",
			teal: "bg-teal-accent text-teal-text",
			cyan: "bg-cyan-accent text-cyan-text",
			"light-blue": "bg-light-blue-accent text-light-blue-text",
			blue: "bg-blue-accent text-blue-text",
			"violet-blue": "bg-violet-blue-accent text-violet-blue-text",
			purple: "bg-purple-accent text-purple-text",
			"dark-orchid": "bg-dark-orchid-accent text-dark-orchid-text",
			fuchsia: "bg-fuchsia-accent text-fuchsia-text",
			magenta: "bg-magenta-accent text-magenta-text",
			rose: "bg-rose-accent text-rose-text",
		},
	},
})

function Avatar({
	className,
	// PostVIA compat: previous default was 32px (see defaultVariants above).
	size = "32",
	rounded = "circle",
	...props
}: AvatarProps) {
	return (
		<AvatarContext.Provider value={{ size, rounded }}>
			<AvatarPrimitive.Root
				data-slot="avatar"
				// PostVIA extension hook: data-size drives AvatarBadge sizing
				// below (values "24" | "32" | "40", matching old sm|default|lg).
				data-size={size}
				className={cn(
					// PostVIA extension hook: named group ancestor for AvatarBadge.
					"group/avatar",
					avatarVariants({ size, rounded }),
					className
				)}
				{...props}
			/>
		</AvatarContext.Provider>
	)
}
Avatar.displayName = "Avatar"

function AvatarImage({ className, ...props }: AvatarImageProps) {
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			className={cn(
				"relative aspect-square size-full rounded-[inherit] object-cover",
				className
			)}
			{...props}
		/>
	)
}
AvatarImage.displayName = "AvatarImage"

function AvatarFallback({ className, color, ...props }: AvatarFallbackProps) {
	const colorClasses = color ? avatarFallbackVariants({ color }) : ""

	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				"flex size-full items-center justify-center rounded-[inherit]",
				// PostVIA compat: previous fallback was muted monochrome.
				colorClasses || "bg-muted text-muted-foreground",
				className
			)}
			{...props}
		/>
	)
}
AvatarFallback.displayName = "AvatarFallback"

function AvatarIndicator({ className, ...props }: AvatarIndicatorProps) {
	return (
		<div
			data-slot="avatar-indicator"
			className={cn(
				"absolute z-10 box-content flex items-center justify-center",
				className
			)}
			{...props}
		/>
	)
}
AvatarIndicator.displayName = "AvatarIndicator"

function AvatarStatus({
	className,
	variant,
	size,
	...props
}: AvatarStatusProps) {
	const { size: contextSize } = useAvatarContext()
	const statusSize = size || contextSize
	return (
		<div
			data-slot="avatar-status"
			className={cn(
				avatarStatusVariants({ variant, size: statusSize }),
				className
			)}
			{...props}
		/>
	)
}
AvatarStatus.displayName = "AvatarStatus"

export {
	Avatar,
	AvatarImage,
	AvatarFallback,
	AvatarIndicator,
	AvatarStatus,
	AvatarBadge,
	AvatarGroup,
	AvatarGroupCount,
	avatarStatusVariants,
	avatarVariants,
	avatarFallbackVariants,
}

// ---------------------------------------------------------------------------
// PostVIA extension layer (no Radian equivalent). Preserved verbatim from the
// previous implementation except the group-data size selectors, remapped
// from the old sm|default|lg scale to the numeric Radian scale:
//   sm (24px) -> "24", default (32px) -> "32", lg (40px) -> "40".
// ---------------------------------------------------------------------------

function AvatarBadge({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="avatar-badge"
			className={cn(
				"absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none",
				'group-data-[size="24"]/avatar:size-2 group-data-[size="24"]/avatar:[&>svg]:hidden',
				'group-data-[size="32"]/avatar:size-2.5 group-data-[size="32"]/avatar:[&>svg]:size-2',
				'group-data-[size="40"]/avatar:size-3 group-data-[size="40"]/avatar:[&>svg]:size-2',
				className
			)}
			{...props}
		/>
	)
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="avatar-group"
			className={cn(
				"group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
				className
			)}
			{...props}
		/>
	)
}

function AvatarGroupCount({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="avatar-group-count"
			className={cn(
				"relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background [&>svg]:size-4",
				'group-has-data-[size="24"]/avatar-group:size-6 group-has-data-[size="24"]/avatar-group:[&>svg]:size-3',
				'group-has-data-[size="40"]/avatar-group:size-10 group-has-data-[size="40"]/avatar-group:[&>svg]:size-5',
				className
			)}
			{...props}
		/>
	)
}
