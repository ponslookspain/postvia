import {
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
  TextArea,
} from "postvia";

/**
 * Field previews. The composition is the app's own form contract
 * (src/app/login/LoginForm.tsx, src/app/settings): `FieldGroup + Field +
 * FieldLabel`, with validation expressed as `data-invalid` on the Field and
 * `aria-invalid` on the control — never as a colour class on the label.
 */

export function TextField() {
  return (
    <div className="w-[380px]">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-email">Email</FieldLabel>
          <Input
            id="f-email"
            type="email"
            autoComplete="email"
            defaultValue="rosa@studio.co"
          />
          <FieldDescription>
            Where post failures and receipts are sent.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="f-handle">Display name</FieldLabel>
          <Input id="f-handle" defaultValue="Rosa at Studio" />
        </Field>
      </FieldGroup>
    </div>
  );
}

export function Invalid() {
  return (
    <div className="w-[380px]">
      <FieldGroup>
        <Field data-invalid>
          <FieldLabel htmlFor="f-bad">Email</FieldLabel>
          <Input id="f-bad" type="email" defaultValue="rosa@studio" aria-invalid />
          <FieldError>Enter a complete email address.</FieldError>
        </Field>
      </FieldGroup>
    </div>
  );
}

export function WithTextArea() {
  return (
    <div className="w-[420px]">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-caption">Caption</FieldLabel>
          <TextArea
            id="f-caption"
            defaultValue="One post, every channel. Scheduling that tells you what is going out next."
          />
          <FieldDescription>
            Tailored per channel in the next step.
          </FieldDescription>
        </Field>
        <Button size="sm" className="w-fit">
          Save draft
        </Button>
      </FieldGroup>
    </div>
  );
}

export function Horizontal() {
  return (
    <div className="w-[420px]">
      <FieldSet>
        <FieldLegend variant="label">Notifications</FieldLegend>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="f-fail" defaultChecked />
            <FieldContent>
              <FieldLabel htmlFor="f-fail">A post fails to publish</FieldLabel>
              <FieldDescription>
                Always on for failures on a connected channel.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="f-weekly" />
            <FieldContent>
              <FieldLabel htmlFor="f-weekly">Weekly summary</FieldLabel>
              <FieldDescription>What went out, every Monday.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}

export function WithSeparator() {
  return (
    <div className="w-[380px]">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="f-pw">Password</FieldLabel>
          <Input id="f-pw" type="password" defaultValue="correcthorse" />
        </Field>
        <FieldSeparator>or</FieldSeparator>
        <Button variant="outline" className="w-full">
          Continue with Google
        </Button>
      </FieldGroup>
    </div>
  );
}
