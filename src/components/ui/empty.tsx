import { type VariantProps, cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

export type EmptyProps = React.ComponentProps<"div">
export type EmptyHeaderProps = React.ComponentProps<"div">
export type EmptyMediaProps = React.ComponentProps<"div"> &
	VariantProps<typeof emptyMediaVariants>
export type EmptyTitleProps = React.ComponentProps<"div">
export type EmptyDescriptionProps = React.ComponentProps<"p">
export type EmptyActionProps = React.ComponentProps<"div">
export type EmptyContentProps = React.ComponentProps<"div">

const emptyMediaVariants = cva(
	"flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				icon: "bg-accent text-primary border p-3 border-accent flex shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-6",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
)

function Empty({ className, ...props }: EmptyProps) {
	return (
		<div
			data-slot="empty"
			className={cn(
				"flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg p-5 text-center text-balance md:p-10",
				className
			)}
			{...props}
		/>
	)
}

function EmptyHeader({ className, ...props }: EmptyHeaderProps) {
	return (
		<div
			data-slot="empty-header"
			className={cn(
				"flex max-w-xs flex-col items-center gap-1.5 text-center",
				className
			)}
			{...props}
		/>
	)
}

function EmptyMedia({
	className,
	variant = "default",
	...props
}: EmptyMediaProps) {
	return (
		<div
			data-slot="empty-icon"
			data-variant={variant}
			className={cn(emptyMediaVariants({ variant, className }))}
			{...props}
		/>
	)
}

function EmptyTitle({ className, ...props }: EmptyTitleProps) {
	return (
		<div
			data-slot="empty-title"
			className={cn("font-medium", className)}
			{...props}
		/>
	)
}

function EmptyDescription({ className, ...props }: EmptyDescriptionProps) {
	return (
		<div
			data-slot="empty-description"
			className={cn(
				"text-muted-foreground [&>a:hover]:text-primary text-sm [&>a]:underline [&>a]:underline-offset-4",
				className
			)}
			{...props}
		/>
	)
}

function EmptyAction({ className, ...props }: EmptyActionProps) {
	return (
		<div
			data-slot="empty-action"
			className={cn(
				"flex w-full max-w-xs min-w-0 items-center justify-center gap-2.5 text-sm text-balance",
				className
			)}
			{...props}
		/>
	)
}

export {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyAction,
	EmptyMedia,
	EmptyContent,
}

// PostVIA compat: previous Empty shipped an EmptyContent wrapper used by
// StateBlock. Kept verbatim so existing composition keeps working.
function EmptyContent({ className, ...props }: EmptyContentProps) {
	return (
		<div
			data-slot="empty-content"
			className={cn(
				"flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
				className
			)}
			{...props}
		/>
	)
}
