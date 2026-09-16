import {
  Badge,
  Checkbox,
  Input,
  Label,
  Switch,
  TextArea,
} from "postvia";

/**
 * Label previews. `Label` is the Radix label primitive; on its own it is a
 * single word, so every cell pairs it with the control it names. Its whole
 * behaviour is the `peer-disabled:` / `peer-has-disabled:` chain, which only
 * reads when the label sits after a peer control — so the disabled cells put
 * the control first.
 */

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  width: 340,
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const inline: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

export function ForControls() {
  return (
    <div style={stack}>
      <div style={field}>
        <Label htmlFor="lb-email">Email</Label>
        <Input id="lb-email" type="email" defaultValue="rosa@studio.co" />
      </div>
      <div style={field}>
        <Label htmlFor="lb-caption">Caption</Label>
        <TextArea
          id="lb-caption"
          rows={3}
          defaultValue="Autumn collection drops Friday at 10:00."
        />
      </div>
    </div>
  );
}

export function Inline() {
  return (
    <div style={stack}>
      <div style={inline}>
        <Checkbox id="lb-cb" defaultChecked />
        <Label htmlFor="lb-cb">Notify me when a post fails</Label>
      </div>
      <div style={inline}>
        <Switch id="lb-sw" defaultChecked />
        <Label htmlFor="lb-sw">Weekly summary email</Label>
      </div>
    </div>
  );
}

export function WithBadge() {
  return (
    <div style={stack}>
      <div style={field}>
        <Label htmlFor="lb-verified">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Email
            <Badge variant="soft">Verified</Badge>
          </span>
        </Label>
        <Input id="lb-verified" type="email" readOnly defaultValue="rosa@studio.co" />
      </div>
    </div>
  );
}

export function PeerDisabled() {
  return (
    <div style={stack}>
      <div style={inline}>
        <Checkbox id="lb-dis-cb" disabled />
        <Label htmlFor="lb-dis-cb">TikTok — reconnect to publish</Label>
      </div>
      <div style={inline}>
        <Switch id="lb-dis-sw" disabled />
        <Label htmlFor="lb-dis-sw">Auto-repost top performers</Label>
      </div>
    </div>
  );
}
