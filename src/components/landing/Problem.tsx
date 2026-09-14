const pains = [
  {
    title: "Copy-pasting into different apps",
    text: "The same post retyped four times, drifting out of sync.",
  },
  {
    title: "Switching between platforms",
    text: "Four inboxes, four drafts, four upload flows.",
  },
  {
    title: "Losing track of schedules",
    text: "No single view of what goes out, and when.",
  },
  {
    title: "Uncertainty about what published",
    text: "One network fails silently and nobody notices until Monday.",
  },
] as const;

export function Problem() {
  return (
    <section
      aria-labelledby="problem-heading"
      className="border-y border-border bg-muted/30"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2
            id="problem-heading"
            className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            Posting one app at a time does not scale.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Postvia replaces the manual loop with one workflow for writing,
            scheduling, and verifying every post.
          </p>
        </div>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {pains.map((pain) => (
            <li
              key={pain.title}
              className="rounded-xl border border-border bg-card p-4"
            >
              <h3 className="text-base font-medium">{pain.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {pain.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
