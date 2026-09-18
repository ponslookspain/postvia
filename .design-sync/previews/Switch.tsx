import {
  Divider,
  Field,
  FieldDescription,
  FieldGroup,
  Label,
  Switch,
  SwitchIndicator,
  SwitchWrapper,
} from "postvia";

/**
 * Switch previews. Numeric sizes ("20"/"24"/"32"), the pill and square
 * shapes, checked/disabled, and the two extras the primitive carries:
 * `SwitchWrapper permanent` (an always-on toggle that never takes the brand
 * fill) and `SwitchIndicator` (a glyph riding inside the thumb). The settings
 * preferences rows are the real call site.
 */

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
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
  color: "var(--color-muted-foreground, #6b7280)",
};

export function Sizes() {
  return (
    <div style={stack}>
      {(["20", "24", "32"] as const).map((size) => (
        <div key={size} style={row}>
          <Switch id={`sw-${size}`} size={size} defaultChecked />
          <Label htmlFor={`sw-${size}`}>size="{size}"</Label>
        </div>
      ))}
    </div>
  );
}

export function States() {
  return (
    <div style={stack}>
      <div style={row}>
        <Switch id="sw-on" defaultChecked />
        <Label htmlFor="sw-on">On</Label>
      </div>
      <div style={row}>
        <Switch id="sw-off" />
        <Label htmlFor="sw-off">Off</Label>
      </div>
      <div style={row}>
        <Switch id="sw-sq" shape="square" size="32" defaultChecked />
        <Label htmlFor="sw-sq">shape="square"</Label>
      </div>
      <div style={row}>
        <Switch id="sw-dis-on" defaultChecked disabled />
        <Label htmlFor="sw-dis-on">Disabled, on</Label>
      </div>
      <div style={row}>
        <Switch id="sw-dis-off" disabled />
        <Label htmlFor="sw-dis-off">Disabled, off</Label>
      </div>
    </div>
  );
}

export function Preferences() {
  return (
    <div style={{ width: 400 }}>
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldDescription style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 500 }}>
              Email notifications
            </span>
            Receive updates about your posts
          </FieldDescription>
          <Switch id="pref-email" aria-label="Email notifications" defaultChecked />
        </Field>
        <Divider />
        <Field orientation="horizontal">
          <FieldDescription style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 500 }}>
              Product updates
            </span>
            News about new features and improvements
          </FieldDescription>
          <Switch id="pref-product" aria-label="Product updates" />
        </Field>
        <Divider />
        <Field orientation="horizontal">
          <FieldDescription style={{ flex: 1 }}>
            <span style={{ display: "block", fontWeight: 500 }}>
              Failure alerts
            </span>
            Always on while a channel is connected
          </FieldDescription>
          <SwitchWrapper permanent>
            <Switch
              id="pref-fail"
              aria-label="Failure alerts"
              checked
              disabled
            />
          </SwitchWrapper>
        </Field>
      </FieldGroup>
    </div>
  );
}

export function WithIndicator() {
  return (
    <div style={stack}>
      <span style={caption}>SwitchIndicator inside the thumb</span>
      <div style={row}>
        <Switch id="sw-ind-on" size="32" defaultChecked>
          <SwitchIndicator state="on">ON</SwitchIndicator>
        </Switch>
        <Label htmlFor="sw-ind-on">Auto-queue drafts</Label>
      </div>
      <div style={row}>
        <Switch id="sw-ind-off" size="32">
          <SwitchIndicator state="off">OFF</SwitchIndicator>
        </Switch>
        <Label htmlFor="sw-ind-off">Repost top performers</Label>
      </div>
    </div>
  );
}
