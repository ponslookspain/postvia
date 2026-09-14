const pains = [
  {
    title: "Copy-paste work",
    text: "Rewrite the same post and upload the same media across multiple apps.",
  },
  {
    title: "Four separate workflows",
    text: "Different editors, limits, previews, and publishing flows for every network.",
  },
  {
    title: "Scattered schedules",
    text: "Without a shared calendar, it is easy to miss a slot or lose track of what comes next.",
  },
  {
    title: "Unclear publishing status",
    text: "One network can fail while the others succeed. You only find out by checking each app.",
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
            Publishing across networks gets messy fast.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Copying the same post between apps creates extra work — and makes
            it harder to know what is scheduled, what failed, and what
            actually went live.
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
