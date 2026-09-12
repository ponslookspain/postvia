import Link from "next/link";

export default function LegalPageShell({
  title,
  effectiveDate,
  intro,
  currentPage,
  children,
}: {
  title: string;
  effectiveDate: string;
  intro?: string;
  currentPage?: "terms" | "privacy";
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8">
        <header className="mb-10">
          <Link
            href="/login"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            &larr; Postvia
          </Link>
          <h1 className="mt-4 text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Effective date: {effectiveDate}
          </p>
          {intro && <p className="mt-6 text-sm leading-6">{intro}</p>}
        </header>

        <div className="flex flex-col gap-8 text-sm leading-6">{children}</div>

        <footer className="mt-14 border-t border-border pt-6 text-xs text-muted-foreground">
          <p className="mb-2">
            See also:{" "}
            <Link
              href="/terms"
              className={
                currentPage === "terms"
                  ? "font-semibold text-foreground"
                  : "hover:text-foreground"
              }
            >
              Terms of Service
            </Link>
            <span className="mx-2">&middot;</span>
            <Link
              href="/privacy"
              className={
                currentPage === "privacy"
                  ? "font-semibold text-foreground"
                  : "hover:text-foreground"
              }
            >
              Privacy Policy
            </Link>
          </p>
          <p>
            Questions?{" "}
            <a
              href="https://github.com/ponslookspain/postvia"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              github.com/ponslookspain/postvia
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{heading}</h2>
      <div className="flex flex-col gap-3 text-sm leading-6">{children}</div>
    </section>
  );
}
