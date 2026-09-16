import {
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Label,
} from "postvia";
import { Star } from "lucide-react";

/**
 * Checkbox previews. Radix root with a `size` axis (sm/md/lg), the
 * checked/unchecked/indeterminate tri-state, and the disabled + invalid
 * treatments. Invalid is inherited from the Field via `[[data-invalid=true]_&]`,
 * so the bare control shows `aria-invalid` and the composed cell shows the
 * Field form.
 */

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  width: 320,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--color-fg-tertiary, #6b7280)",
};

export function Sizes() {
  return (
    <div style={stack}>
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} style={row}>
          <Checkbox id={`cb-size-${size}`} size={size} defaultChecked />
          <Label htmlFor={`cb-size-${size}`}>size="{size}"</Label>
        </div>
      ))}
    </div>
  );
}

export function States() {
  return (
    <div style={stack}>
      <div style={row}>
        <Checkbox id="cb-off" />
        <Label htmlFor="cb-off">Unchecked</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-on" defaultChecked />
        <Label htmlFor="cb-on">Checked</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-mixed" checked="indeterminate" />
        <Label htmlFor="cb-mixed">Indeterminate</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-invalid" aria-invalid />
        <Label htmlFor="cb-invalid">Invalid</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-disabled" disabled />
        <Label htmlFor="cb-disabled">Disabled</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-disabled-on" disabled defaultChecked />
        <Label htmlFor="cb-disabled-on">Disabled, checked</Label>
      </div>
    </div>
  );
}

export function ChannelPicker() {
  return (
    <div style={{ width: 340 }}>
      <FieldGroup>
        <Field orientation="horizontal">
          <Checkbox id="cb-ig" defaultChecked />
          <FieldContent>
            <FieldLabel htmlFor="cb-ig">Instagram — @rosa.studio</FieldLabel>
            <FieldDescription>Feed post, 2,200 character limit.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="cb-x" defaultChecked />
          <FieldContent>
            <FieldLabel htmlFor="cb-x">X — @rosastudio</FieldLabel>
            <FieldDescription>280 characters; text will be trimmed.</FieldDescription>
          </FieldContent>
        </Field>
        <Field orientation="horizontal" data-disabled>
          <Checkbox id="cb-tt" disabled />
          <FieldContent>
            <FieldLabel htmlFor="cb-tt">TikTok — @rosastudio</FieldLabel>
            <FieldDescription>Reconnect the account to publish.</FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>
    </div>
  );
}

export function CustomIcon() {
  return (
    <div style={stack}>
      <span style={caption}>icon prop replaces the default check</span>
      <div style={row}>
        <Checkbox id="cb-pin" size="lg" defaultChecked icon={<Star />} />
        <Label htmlFor="cb-pin">Pin to the top of the queue</Label>
      </div>
    </div>
  );
}
