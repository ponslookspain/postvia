import { Field, FieldError, FieldLabel, Label, TextArea } from "postvia";

/**
 * TextArea previews. The composer (ComposerCard, TargetCustomizer,
 * BulkScheduler) is the only real caller, so these show the axes it uses:
 * `rows` for height, the `rounded` variant, the `resizable` escape hatch, and
 * the over-limit state expressed as `aria-invalid` inside a Field.
 */

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  width: 400,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--color-muted-foreground, #6b7280)",
};

export function Composer() {
  return (
    <div style={stack}>
      <Label htmlFor="ta-post">Post content</Label>
      <TextArea
        id="ta-post"
        rows={6}
        defaultValue={
          "Autumn collection drops Friday at 10:00.\n\nEvery piece is cut and finished in the studio — 40 made, no restock. Link in bio on the day."
        }
      />
    </div>
  );
}

export function Rows() {
  return (
    <div style={stack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={caption}>rows=&#123;2&#125; — per-channel override</span>
        <TextArea
          rows={2}
          defaultValue="Autumn drops Friday, 10:00. 40 pieces, no restock."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={caption}>rows=&#123;5&#125; — bulk batch text</span>
        <TextArea
          rows={5}
          placeholder="Write something worth publishing..."
        />
      </div>
    </div>
  );
}

export function Variants() {
  return (
    <div style={stack}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={caption}>rounded="square"</span>
        <TextArea
          rounded="square"
          rows={3}
          defaultValue="Behind the scenes from today's shoot."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={caption}>resizable</span>
        <TextArea
          resizable
          rows={3}
          defaultValue="Draft: three ways we cut waste this season."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={caption}>disabled</span>
        <TextArea
          disabled
          rows={3}
          defaultValue="Published 12 Sep — text can no longer be edited."
        />
      </div>
    </div>
  );
}

export function OverLimit() {
  return (
    <div style={{ width: 400 }}>
      <Field data-invalid>
        <FieldLabel htmlFor="ta-long">Post content</FieldLabel>
        <TextArea
          id="ta-long"
          rows={4}
          aria-invalid
          defaultValue={
            "Autumn collection drops Friday at 10:00 — forty pieces, cut and finished in the studio, and once they are gone there is no restock, so if you have had your eye on the coat this is the week."
          }
        />
        <FieldError>
          Too long for X, Bluesky. Shorten the text or customize it per channel.
        </FieldError>
      </Field>
    </div>
  );
}
