export function hasEnv(name: string): boolean {
  try {
    const value = process.env[name];
    return typeof value === "string" && value.trim() !== "";
  } catch {
    return false;
  }
}

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

export function logBlobAuthEnvPresence(): void {
  logDiagnostic("blob", "auth env presence (names only)", {
    BLOB_STORE_ID: hasEnv("BLOB_STORE_ID"),
    VERCEL_OIDC_TOKEN: hasEnv("VERCEL_OIDC_TOKEN"),
    BLOB_READ_WRITE_TOKEN: hasEnv("BLOB_READ_WRITE_TOKEN"),
    BLOB_API_URL: hasEnv("BLOB_API_URL"),
  });
}