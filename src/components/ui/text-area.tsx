"use client"

import { type ChangeEvent, useState } from "react"
import { type VariantProps, cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

export type TextAreaProps = React.ComponentProps<"textarea"> &
	VariantProps<typeof textareaStyles> & {
		resizable?: boolean
	}

export type UseCharacterLimitOptions = {
	maxLength: number
	initialValue?: string
}

const textareaStyles = cva(
	// PostVIA compat: previous Textarea was min-h-16 and non-resizable.
	"peer text-sm placeholder:text-sm text-foreground w-full min-h-16 border border-overlay-12 bg-background px-2.5 py-2 font-normal drop-shadow-xs focus:border-primary aria-invalid:ring-error-focus aria-invalid:border-error focus:outline-hidden focus:ring-2 focus:ring-primary/30 disabled:border-accent disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed disabled:resize-none",
	{
		variants: {
			rounded: {
				rounded: "rounded-md",
				square: "rounded-none",
			},
		},
		defaultVariants: {
			rounded: "rounded",
		},
	}
)

function TextArea({
	className,
	rounded = "rounded",
	// PostVIA compat: previous Textarea was resize-none.
	resizable = false,
	...props
}: TextAreaProps) {
	return (
		<textarea
			data-slot="textarea"
			data-disabled={props.disabled ? "" : undefined}
			className={cn(
				textareaStyles({ rounded }),
				{
					"resize-none": resizable === false,
				},
				className
			)}
			{...props}
		/>
	)
}
TextArea.displayName = "TextArea"

function useCharacterLimit({
	maxLength,
	initialValue = "",
}: UseCharacterLimitOptions) {
	const [value, setValue] = useState(initialValue)

	const characterCount = value.length
	const remainingCharacters = maxLength - characterCount

	const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
		const input = e.target.value
		if (input.length <= maxLength) {
			setValue(input)
		}
	}

	return {
		value,
		setValue,
		characterCount,
		remainingCharacters,
		maxLength,
		handleChange,
	}
}

export { TextArea, useCharacterLimit }
