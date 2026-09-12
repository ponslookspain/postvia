export function safePathname(pathname: string): string {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts[0] === "media" && parts[1]) {
    return `media/${parts[1]}/***`;
  }
  return "***";
}

export function logDiagnostic(
  scope: string,
  event: string,
  fields?: Record<string, unknown>
): void {
  console.info(`[postvia] ${scope}: ${event}`, fields ?? {});
}

export function logErrorDiagnostic(
  scope: string,
  event: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[postvia] ${scope}: ${event}`, {
    ...(extra ?? {}),
    errorName: name,
    errorMessage: message,
  });
}
