import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
        <p className="mb-8 text-center font-heading text-lg font-semibold tracking-tight">
          postvia
        </p>
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-balance text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
