import { Button, Spinner } from "postvia";

/**
 * Spinner previews. Four variants (`default`, `simple`, `activity`,
 * `wave`), all `currentColor`, all defaulting to 16px so they sit inline
 * in a button without a sizing class. The async-action composition
 * (`Spinner + data-icon="inline-start" + disabled`, no `isLoading` prop)
 * is the one used throughout `src/app/accounts/AccountsContent.tsx`.
 * Every variant animates, so each cell is legible as a still frame: the
 * arcs and dots are drawn, only their rotation/opacity moves.
 */

const stage: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: 360,
};

const caption: React.CSSProperties = {
  fontSize: 13,
  lineHeight: "18px",
  color: "var(--muted-foreground)",
};

const variants = ["default", "simple", "activity", "wave"] as const;

export function Variants() {
  return (
    <div style={{ ...stage, flexDirection: "row", gap: 28 }}>
      {variants.map((variant) => (
        <div
          key={variant}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Spinner variant={variant} size={28} />
          <span style={caption}>{variant}</span>
        </div>
      ))}
    </div>
  );
}

export function InButton() {
  return (
    <div style={{ ...stage, flexDirection: "row", gap: 12, width: "auto" }}>
      <Button disabled>
        <Spinner data-icon="inline-start" />
        Publishing…
      </Button>
      <Button variant="outline" disabled>
        <Spinner data-icon="inline-start" />
        Connecting
      </Button>
    </div>
  );
}

export function InlineStatus() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Spinner size={16} />
        <span style={{ fontSize: 14, lineHeight: "20px" }}>
          Checking your Instagram connection…
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Spinner variant="wave" size={16} />
        <span style={caption}>Generating a caption</span>
      </div>
    </div>
  );
}

export function Sizes() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        color: "var(--primary)",
      }}
    >
      {[16, 24, 32, 48].map((size) => (
        <Spinner key={size} variant="simple" size={size} />
      ))}
    </div>
  );
}
