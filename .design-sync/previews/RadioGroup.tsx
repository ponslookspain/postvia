import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Label,
  RadioGroup,
  RadioGroupItem,
} from "postvia";

/**
 * RadioGroup previews. The group owns the `size` axis through context
 * (sm/md/lg) and lays its items out on a `grid gap-3`, so a cell only has to
 * supply the items. Shown: the size sweep, the per-item disabled/invalid
 * treatments, a real single-choice question in the Field contract, and the
 * horizontal orientation.
 */

const itemRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 18,
  width: 320,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--color-muted-foreground, #6b7280)",
};

export function Sizes() {
  return (
    <div style={stack}>
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={caption}>size="{size}"</span>
          <RadioGroup size={size} defaultValue="now">
            <div style={itemRow}>
              <RadioGroupItem value="now" id={`rg-${size}-now`} />
              <Label htmlFor={`rg-${size}-now`}>Publish now</Label>
            </div>
            <div style={itemRow}>
              <RadioGroupItem value="later" id={`rg-${size}-later`} />
              <Label htmlFor={`rg-${size}-later`}>Schedule for later</Label>
            </div>
          </RadioGroup>
        </div>
      ))}
    </div>
  );
}

export function States() {
  return (
    <div style={{ width: 320 }}>
      <RadioGroup defaultValue="draft">
        <div style={itemRow}>
          <RadioGroupItem value="draft" id="rg-s-draft" />
          <Label htmlFor="rg-s-draft">Selected</Label>
        </div>
        <div style={itemRow}>
          <RadioGroupItem value="queued" id="rg-s-queued" />
          <Label htmlFor="rg-s-queued">Unselected</Label>
        </div>
        <div style={itemRow}>
          <RadioGroupItem value="invalid" id="rg-s-invalid" aria-invalid />
          <Label htmlFor="rg-s-invalid">Invalid</Label>
        </div>
        <div style={itemRow}>
          <RadioGroupItem value="archived" id="rg-s-archived" disabled />
          <Label htmlFor="rg-s-archived">Disabled</Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function ScheduleChoice() {
  return (
    <div style={{ width: 380 }}>
      <RadioGroup defaultValue="queue">
        <FieldGroup>
          <Field orientation="horizontal">
            <RadioGroupItem value="now" id="rg-c-now" />
            <FieldContent>
              <FieldLabel htmlFor="rg-c-now">Publish now</FieldLabel>
              <FieldDescription>
                Goes out to all three channels immediately.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="queue" id="rg-c-queue" />
            <FieldContent>
              <FieldLabel htmlFor="rg-c-queue">Add to the queue</FieldLabel>
              <FieldDescription>
                Next free slot is Friday, 10:00.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <RadioGroupItem value="pick" id="rg-c-pick" />
            <FieldContent>
              <FieldLabel htmlFor="rg-c-pick">Pick a date and time</FieldLabel>
              <FieldDescription>
                Times are shown in Europe/Madrid.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </RadioGroup>
    </div>
  );
}

export function Horizontal() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 380 }}>
      <span style={caption}>one row — the caller lays the items out</span>
      <RadioGroup defaultValue="30">
        <div style={{ display: "flex", gap: 20 }}>
          {(["15", "30", "60"] as const).map((mins) => (
            <div key={mins} style={itemRow}>
              <RadioGroupItem value={mins} id={`rg-h-${mins}`} />
              <Label htmlFor={`rg-h-${mins}`}>{mins} min</Label>
            </div>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
