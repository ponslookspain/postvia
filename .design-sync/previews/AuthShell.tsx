import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  AuthShell,
} from "postvia";
import { TriangleAlertIcon } from "lucide-react";

/**
 * AuthShell previews. The shell is a centred max-w-sm column with the
 * wordmark above a title and an optional description — on its own it is
 * nearly empty, so each cell composes the body the real page passes:
 * the sign-in form, the verify-email prompt, and a failed sign-in.
 */

export function SignIn() {
  return (
    <AuthShell
      title="Sign in to postvia"
      description="Publish to social media in one place"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="auth-email">Email</FieldLabel>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              defaultValue="rosa@velastudio.co"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password">Password</FieldLabel>
            <Input
              id="auth-password"
              type="password"
              defaultValue="password123"
            />
          </Field>
        </FieldGroup>
        <Button style={{ width: "100%" }}>Sign in</Button>
        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: 13,
            color: "var(--color-fg-tertiary)",
          }}
        >
          New here? Create an account.
        </p>
      </div>
    </AuthShell>
  );
}

export function VerifyEmail() {
  return (
    <AuthShell
      title="Check your email"
      description="We sent a six-digit code to rosa@velastudio.co. It expires in 10 minutes."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="auth-code">Verification code</FieldLabel>
            <Input
              id="auth-code"
              inputMode="numeric"
              defaultValue="408 213"
            />
          </Field>
        </FieldGroup>
        <Button style={{ width: "100%" }}>Verify email</Button>
        <Button variant="ghost" size="sm" style={{ width: "100%" }}>
          Send the code again
        </Button>
      </div>
    </AuthShell>
  );
}

export function SignInFailed() {
  return (
    <AuthShell
      title="Sign in to postvia"
      description="Publish to social media in one place"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Alert color="error" variant="outline">
          <TriangleAlertIcon />
          <AlertContent>
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>
              That email and password don&apos;t match. Try again, or reset
              your password.
            </AlertDescription>
          </AlertContent>
        </Alert>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="auth-email-2">Email</FieldLabel>
            <Input
              id="auth-email-2"
              type="email"
              defaultValue="rosa@velastudio.co"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password-2">Password</FieldLabel>
            <Input id="auth-password-2" type="password" defaultValue="wrongpass" />
          </Field>
        </FieldGroup>
        <Button style={{ width: "100%" }}>Sign in</Button>
      </div>
    </AuthShell>
  );
}
