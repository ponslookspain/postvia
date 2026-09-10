"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const CONFIRMATION_PHRASE = "УДАЛИТЬ";

type Message = { type: "success" | "error"; text: string } | null;

function Section({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`border rounded-lg p-6 ${
        danger ? "border-destructive/40 bg-red-50/40" : "border-border"
      }`}
    >
      <h2
        className={`text-sm font-semibold ${
          danger ? "text-destructive" : "text-foreground"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Alert({ message }: { message: NonNullable<Message> }) {
  const isError = message.type === "error";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-3 rounded-md border text-sm ${
        isError
          ? "border-destructive/30 bg-red-50 text-destructive"
          : "border-border bg-muted/50 text-foreground"
      }`}
    >
      {message.text}
    </div>
  );
}

function Switch({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? "bg-primary" : "bg-muted-foreground/30"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const inputClassName =
  "w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function SettingsClient({
  name: initialName,
  email,
  emailVerified,
  preferences: initialPreferences,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
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
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

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

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setConfirmText("");
    setDeleteMessage(null);
    deleteTriggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isDeleteModalOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDeleteModal();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isDeleteModalOpen, closeDeleteModal]);

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
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your profile, security and preferences
        </p>
      </div>

      <Section title="Profile" description="Update the name shown in your account">
        <div className="space-y-4 max-w-sm">
          <div>
            <label
              htmlFor="settings-name"
              className="block text-sm font-medium mb-1"
            >
              Name
            </label>
            <input
              id="settings-name"
              type="text"
              autoComplete="name"
              value={name}
              maxLength={50}
              onChange={(e) => setName(e.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label
              htmlFor="settings-email"
              className="block text-sm font-medium mb-1"
            >
              Email
            </label>
            <input
              id="settings-email"
              type="email"
              value={email}
              readOnly
              disabled
              className={`${inputClassName} opacity-60 cursor-not-allowed`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {emailVerified
                ? "Verified"
                : "Email change is currently not supported"}
            </p>
          </div>
          {nameMessage && (
            <Alert message={nameMessage} />
          )}
          <button
            onClick={handleSaveName}
            disabled={savingName}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingName ? "Saving..." : "Save changes"}
          </button>
        </div>
      </Section>

      <Section title="Security" description="Change your account password">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleChangePassword();
          }}
          className="space-y-4 max-w-sm"
        >
          <div>
            <label
              htmlFor="settings-current-password"
              className="block text-sm font-medium mb-1"
            >
              Current password
            </label>
            <input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              value={password.current}
              onChange={(e) =>
                setPassword((p) => ({ ...p, current: e.target.value }))
              }
              aria-invalid={Boolean(passwordErrors.current)}
              className={inputClassName}
            />
            {passwordErrors.current && (
              <p className="text-xs text-destructive mt-1">
                {passwordErrors.current}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="settings-new-password"
              className="block text-sm font-medium mb-1"
            >
              New password
            </label>
            <input
              id="settings-new-password"
              type="password"
              autoComplete="new-password"
              value={password.next}
              onChange={(e) =>
                setPassword((p) => ({ ...p, next: e.target.value }))
              }
              aria-invalid={Boolean(passwordErrors.next)}
              className={inputClassName}
            />
            {passwordErrors.next && (
              <p className="text-xs text-destructive mt-1">
                {passwordErrors.next}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="settings-confirm-password"
              className="block text-sm font-medium mb-1"
            >
              Confirm new password
            </label>
            <input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              value={password.confirm}
              onChange={(e) =>
                setPassword((p) => ({ ...p, confirm: e.target.value }))
              }
              aria-invalid={Boolean(passwordErrors.confirm)}
              className={inputClassName}
            />
            {passwordErrors.confirm && (
              <p className="text-xs text-destructive mt-1">
                {passwordErrors.confirm}
              </p>
            )}
          </div>
          {passwordMessage && <Alert message={passwordMessage} />}
          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingPassword ? "Changing..." : "Change password"}
          </button>
        </form>
      </Section>

      <Section title="Preferences" description="Choose how you want to hear from us">
        <div className="space-y-4 max-w-sm">
          {prefsMessage && <Alert message={prefsMessage} />}
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive updates about your posts
              </p>
            </div>
            <Switch
              checked={prefs.emailNotifications}
              disabled={savingPref === "emailNotifications"}
              label="Email notifications"
              onChange={() =>
                void handleTogglePref("emailNotifications")
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="pr-4">
              <p className="text-sm font-medium">Product updates</p>
              <p className="text-sm text-muted-foreground">
                News about new features and improvements
              </p>
            </div>
            <Switch
              checked={prefs.productUpdates}
              disabled={savingPref === "productUpdates"}
              label="Product updates"
              onChange={() => void handleTogglePref("productUpdates")}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Danger Zone"
        description="Permanently delete your account and all associated data"
        danger
      >
        <div className="max-w-sm">
          <p className="text-sm text-destructive/90 mb-4">
            Once you delete your account there is no going back. All your
            posts, connected social accounts, sessions and account data will
            be permanently removed.
          </p>
          <button
            ref={deleteTriggerRef}
            onClick={() => setDeleteModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/40 rounded-md hover:bg-red-50 transition-colors"
          >
            Delete account
          </button>
        </div>
      </Section>

      {isDeleteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            aria-describedby="delete-account-description"
            className="w-full max-w-md bg-background border border-border rounded-lg p-6 shadow-lg"
          >
            <h2
              id="delete-account-title"
              className="text-lg font-semibold text-destructive"
            >
              Delete your account?
            </h2>
            <p
              id="delete-account-description"
              className="text-sm text-muted-foreground mt-2"
            >
              This action is permanent and cannot be undone. All your posts,
              connected social accounts, sessions and account data will be
              deleted.
            </p>
            <div className="mt-4">
              <label
                htmlFor="delete-confirmation-input"
                className="block text-sm font-medium mb-1"
              >
                Type {CONFIRMATION_PHRASE} to confirm
              </label>
              <input
                id="delete-confirmation-input"
                ref={confirmInputRef}
                autoFocus
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className={inputClassName}
              />
            </div>
            {deleteMessage && (
              <div className="mt-3">
                <Alert message={deleteMessage} />
              </div>
            )}
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmDelete()}
                disabled={!canConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}