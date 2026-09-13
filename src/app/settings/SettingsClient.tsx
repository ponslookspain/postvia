"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSignIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer, PageSections } from "@/components/layout/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const CONFIRMATION_PHRASE = "delete";

type Message = { type: "success" | "error"; text: string } | null;

function FormAlert({ message }: { message: NonNullable<Message> }) {
  return (
    <Alert variant={message.type === "error" ? "destructive" : "default"}>
      {message.type === "error" && <TriangleAlertIcon />}
      <AlertTitle>
        {message.type === "error" ? "Something went wrong" : "Saved"}
      </AlertTitle>
      <AlertDescription>{message.text}</AlertDescription>
    </Alert>
  );
}

function GoogleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SettingsClient({
  name: initialName,
  email,
  emailVerified,
  hasPassword,
  hasGoogle,
  preferences: initialPreferences,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  preferences: { emailNotifications: boolean; productUpdates: boolean };
}) {
  const router = useRouter();

  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<Message>(null);

  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    next?: string;
    confirm?: string;
  }>({});
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<Message>(null);

  const [prefs, setPrefs] = useState(initialPreferences);
  const [savingPref, setSavingPref] = useState<string | null>(null);
  const [prefsMessage, setPrefsMessage] = useState<Message>(null);

  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<Message>(null);

  const canConfirmDelete =
    !deleting && confirmText === CONFIRMATION_PHRASE;

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameMessage({ type: "error", text: "Name is required" });
      return;
    }
    if (trimmed.length > 50) {
      setNameMessage({
        type: "error",
        text: "Name must be 50 characters or fewer",
      });
      return;
    }
    setSavingName(true);
    setNameMessage(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameMessage({
          type: "error",
          text: data.error || "Failed to update profile",
        });
        return;
      }
      setName(trimmed);
      setNameMessage({ type: "success", text: "Profile updated" });
      router.refresh();
    } catch {
      setNameMessage({ type: "error", text: "Failed to update profile" });
    } finally {
      setSavingName(false);
    }
  }

  function validatePassword(): boolean {
    const errors: typeof passwordErrors = {};
    if (!password.current) errors.current = "Current password is required";
    if (!password.next) errors.next = "New password is required";
    else if (password.next.length < 8)
      errors.next = "New password must be at least 8 characters";
    if (password.confirm !== password.next)
      errors.confirm = "Passwords do not match";
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleChangePassword() {
    if (!validatePassword()) return;
    setSavingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: password.current,
          newPassword: password.next,
          confirmPassword: password.confirm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({
          type: "error",
          text: data.error || "Failed to change password",
        });
        return;
      }
      setPassword({ current: "", next: "", confirm: "" });
      setPasswordErrors({});
      setPasswordMessage({
        type: "success",
        text: "Password changed. Other sessions have been signed out.",
      });
    } catch {
      setPasswordMessage({ type: "error", text: "Failed to change password" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleSetPassword() {
    if (!password.next) {
      setPasswordErrors({ next: "New password is required" });
      return;
    }
    if (password.next.length < 8) {
      setPasswordErrors({ next: "New password must be at least 8 characters" });
      return;
    }
    if (password.confirm !== password.next) {
      setPasswordErrors({ confirm: "Passwords do not match" });
      return;
    }
    setSavingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: password.next,
          confirmPassword: password.confirm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({
          type: "error",
          text: data.error || "Failed to set password",
        });
        return;
      }
      setPassword({ current: "", next: "", confirm: "" });
      setPasswordErrors({});
      setPasswordMessage({
        type: "success",
        text: "Password set. You can now sign in with email and password.",
      });
      router.refresh();
    } catch {
      setPasswordMessage({ type: "error", text: "Failed to set password" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleTogglePref(
    key: "emailNotifications" | "productUpdates"
  ) {
    const nextValue = !prefs[key];
    setSavingPref(key);
    setPrefsMessage(null);
    const previous = { ...prefs };
    setPrefs((p) => ({ ...p, [key]: nextValue }));
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPrefs(previous);
        setPrefsMessage({
          type: "error",
          text: data.error || "Failed to save preferences",
        });
        return;
      }
      setPrefsMessage({ type: "success", text: "Preferences saved" });
    } catch {
      setPrefs(previous);
      setPrefsMessage({
        type: "error",
        text: "Failed to save preferences",
      });
    } finally {
      setSavingPref(null);
    }
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false);
    setConfirmText("");
    setDeleteMessage(null);
  }

  async function handleConfirmDelete() {
    if (!canConfirmDelete) return;
    setDeleting(true);
    setDeleteMessage(null);
    try {
      const res = await fetch("/api/settings/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: confirmText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteMessage({
          type: "error",
          text: data.error || "Failed to delete account",
        });
        setDeleting(false);
        return;
      }
      try {
        await authClient.signOut();
      } catch {
        // Session is already gone server-side; redirect regardless
      }
      router.push("/login?deleted=1");
      router.refresh();
    } catch {
      setDeleteMessage({
        type: "error",
        text: "Failed to delete account. Please try again.",
      });
      setDeleting(false);
    }
  }

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Settings"
        description="Manage your profile, security and preferences"
      />

      <PageSections>
        <section aria-labelledby="settings-profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>
                Update the name shown in your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="settings-name">Name</FieldLabel>
                  <Input
                    id="settings-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    maxLength={50}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field data-disabled>
                  <FieldLabel htmlFor="settings-email">
                    <span className="flex items-center gap-2">
                      Email
                      {emailVerified && (
                        <Badge variant="secondary">Verified</Badge>
                      )}
                    </span>
                  </FieldLabel>
                  <Input
                    id="settings-email"
                    type="email"
                    value={email}
                    readOnly
                    disabled
                  />
                  {!emailVerified && (
                    <FieldDescription>
                      Email change is currently not supported
                    </FieldDescription>
                  )}
                </Field>
                {nameMessage && <FormAlert message={nameMessage} />}
                <div>
                  <Button
                    size="lg"
                    onClick={() => void handleSaveName()}
                    disabled={savingName}
                    className="min-h-11 w-full sm:w-auto"
                  >
                    {savingName && <Spinner data-icon="inline-start" />}
                    {savingName ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="settings-signin">
          <Card>
            <CardHeader>
              <CardTitle>Sign-in methods</CardTitle>
              <CardDescription>
                How you can sign in to your account
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex min-h-11 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                >
                  <AtSignIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    Email and password
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {hasPassword
                      ? "Password is set"
                      : "No password set yet"}
                  </span>
                </span>
                <Badge
                  variant={hasPassword ? "secondary" : "outline"}
                  className="shrink-0"
                >
                  {hasPassword ? "Connected" : "Not set"}
                </Badge>
              </div>
              <Separator />
              <div className="flex min-h-11 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                >
                  <GoogleGlyph className="size-4 shrink-0" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    Google
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Sign in with your Google account
                  </span>
                </span>
                <Badge
                  variant={hasGoogle ? "secondary" : "outline"}
                  className="shrink-0"
                >
                  {hasGoogle ? "Connected" : "Not connected"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="settings-security">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                {hasPassword
                  ? "Change your account password"
                  : "Set a password so you can sign in with email and password"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (hasPassword) void handleChangePassword();
                  else void handleSetPassword();
                }}
              >
                <FieldGroup>
                  {hasPassword && (
                    <Field data-invalid={Boolean(passwordErrors.current) || undefined}>
                      <FieldLabel htmlFor="settings-current-password">
                        Current password
                      </FieldLabel>
                      <Input
                        id="settings-current-password"
                        type="password"
                        autoComplete="current-password"
                        value={password.current}
                        onChange={(e) =>
                          setPassword((p) => ({ ...p, current: e.target.value }))
                        }
                        aria-invalid={Boolean(passwordErrors.current) || undefined}
                      />
                      {passwordErrors.current && (
                        <FieldError>{passwordErrors.current}</FieldError>
                      )}
                    </Field>
                  )}
                  <Field data-invalid={Boolean(passwordErrors.next) || undefined}>
                    <FieldLabel htmlFor="settings-new-password">
                      New password
                    </FieldLabel>
                    <Input
                      id="settings-new-password"
                      type="password"
                      autoComplete="new-password"
                      value={password.next}
                      onChange={(e) =>
                        setPassword((p) => ({ ...p, next: e.target.value }))
                      }
                      aria-invalid={Boolean(passwordErrors.next) || undefined}
                    />
                    {passwordErrors.next ? (
                      <FieldError>{passwordErrors.next}</FieldError>
                    ) : (
                      <FieldDescription>
                        Must be at least 8 characters long.
                      </FieldDescription>
                    )}
                  </Field>
                  <Field data-invalid={Boolean(passwordErrors.confirm) || undefined}>
                    <FieldLabel htmlFor="settings-confirm-password">
                      Confirm new password
                    </FieldLabel>
                    <Input
                      id="settings-confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={password.confirm}
                      onChange={(e) =>
                        setPassword((p) => ({ ...p, confirm: e.target.value }))
                      }
                      aria-invalid={Boolean(passwordErrors.confirm) || undefined}
                    />
                    {passwordErrors.confirm && (
                      <FieldError>{passwordErrors.confirm}</FieldError>
                    )}
                  </Field>
                  {passwordMessage && <FormAlert message={passwordMessage} />}
                  <div>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={savingPassword}
                      className="min-h-11 w-full sm:w-auto"
                    >
                      {savingPassword && <Spinner data-icon="inline-start" />}
                      <KeyRoundIcon data-icon="inline-start" />
                      {savingPassword
                        ? "Saving..."
                        : hasPassword
                          ? "Change password"
                          : "Set password"}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="settings-preferences">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
              <CardDescription>
                Choose how you want to hear from us
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {prefsMessage && <FormAlert message={prefsMessage} />}
                <Field orientation="horizontal" className="min-h-11">
                  <FieldDescription className="flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Email notifications
                    </span>
                    Receive updates about your posts
                  </FieldDescription>
                  <Switch
                    id="prefs-email"
                    aria-label="Email notifications"
                    checked={prefs.emailNotifications}
                    disabled={savingPref === "emailNotifications"}
                    onCheckedChange={() =>
                      void handleTogglePref("emailNotifications")
                    }
                  />
                </Field>
                <Separator />
                <Field orientation="horizontal" className="min-h-11">
                  <FieldDescription className="flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      Product updates
                    </span>
                    News about new features and improvements
                  </FieldDescription>
                  <Switch
                    id="prefs-product"
                    aria-label="Product updates"
                    checked={prefs.productUpdates}
                    disabled={savingPref === "productUpdates"}
                    onCheckedChange={() =>
                      void handleTogglePref("productUpdates")
                    }
                  />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="settings-danger">
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
              <CardDescription>
                Permanently delete your account and all associated data
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                Once you delete your account there is no going back. All your
                posts, connected social accounts, sessions and account data
                will be permanently removed.
              </p>
              <div>
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setDeleteModalOpen(true)}
                  className="min-h-11 w-full sm:w-auto"
                >
                  Delete account
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </PageSections>

      <Dialog
        open={isDeleteModalOpen}
        onOpenChange={(open) => {
          if (!open) closeDeleteModal();
          else setDeleteModalOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your posts,
              connected social accounts, sessions and account data will be
              deleted.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="delete-confirmation-input">
                Type {CONFIRMATION_PHRASE} to confirm
              </FieldLabel>
              <Input
                id="delete-confirmation-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </Field>
            {deleteMessage && <FormAlert message={deleteMessage} />}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteModal} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={!canConfirmDelete}
            >
              {deleting && <Spinner data-icon="inline-start" />}
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
