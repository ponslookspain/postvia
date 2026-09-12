"use client";

import { TriangleAlertIcon } from "lucide-react";
import { FieldError } from "@/components/ui/field";
import type { PreviewValidation } from "@/lib/composer-previews";

/**
 * Stage 2B: structured validation from ComposerPreviewModel. Errors use the
 * built-in alert role; warnings stay quiet. Never replaces the editor's own
 * inline errors — it surfaces what previously had no UI (media issues,
 * missing TikTok title).
 */
export function PreviewValidation({
  validation,
}: {
  validation: PreviewValidation;
}) {
  if (validation.errors.length === 0 && validation.warnings.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      {validation.errors.map((issue) => (
        <FieldError key={issue.code}>{issue.message}</FieldError>
      ))}
      {validation.warnings.map((issue) => (
        <p
          key={issue.code}
          className="flex items-start gap-1.5 text-xs text-muted-foreground"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {issue.message}
        </p>
      ))}
    </div>
  );
}
