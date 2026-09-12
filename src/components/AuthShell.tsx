import type { ReactNode } from "react";
import { cn } from "cn";

export function AuthShell({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className={cn("w-full max-w-sm", className)}>
        <p className="mb-8 text-lg font-semibold tracking-tight">postvia</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 mb-8 text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {!description && <div className="mb-8" />}
        {children}
      </div>
    </div>
  );
}
