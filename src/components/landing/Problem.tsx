import { Reveal } from "@/components/landing/Reveal";

const pains = [
  {
    title: "Copy-paste work",
    text: "The same post, rewritten and re-uploaded across four apps.",
  },
  {
    title: "Four separate workflows",
    text: "Different editors, limits, and publishing flows per network.",
  },
  {
    title: "Scattered schedules",
    text: "No shared view of what is queued, so slots get missed.",
  },
  {
    title: "Unclear outcomes",
    text: "One network can fail silently while the others succeed.",
  },
] as const;

/**
 * Quiet editorial problem statement. Hairline rows, not cards —
 * the page earns its cards later for real product UI.
 */
export function Problem() {
  return (
    <section aria-labelledby="problem-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            Why Postvia exists
          </p>
          <h2
            id="problem-heading"
            className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Publishing across networks gets messy fast.
          </h2>
        </Reveal>
        <Reveal as="ul" delay={150} className="mt-8 border-t border-border">
          {pains.map((pain) => (
            <li
              key={pain.title}
              className="grid gap-1 border-b border-border py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6"
            >
              <h3 className="text-prose font-medium">{pain.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {pain.text}
              </p>
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
