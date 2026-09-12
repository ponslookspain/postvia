"use client";

import { CalendarClockIcon, SaveIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Stage I (P2-6): fixed bottom action bar for small screens only
 * (`lg:hidden`). Mirrors the PublishCard buttons 1:1 — same handlers,
 * same disabled logic, same labels — so publishing actions stay reachable
 * without scrolling past the previews on mobile. Desktop is untouched.
 */
export function MobileComposerBar({
  canSave,
  canPublish,
  saving,
  scheduling,
  publishing,
  schedulingForX,
  onSaveDraft,
  onScheduleClick,
  onPublish,
}: {
  canSave: boolean;
  canPublish: boolean;
  saving: boolean;
  scheduling: boolean;
  publishing: boolean;
  schedulingForX: boolean;
  onSaveDraft: () => void;
  onScheduleClick: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <div className="flex gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          onClick={onSaveDraft}
          disabled={!canSave}
          className="flex-1"
          aria-label={saving ? "Saving draft" : "Save draft"}
        >
          {saving && <Spinner data-icon="inline-start" />}
          {!saving && <SaveIcon data-icon="inline-start" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="outline"
          onClick={onScheduleClick}
          disabled={scheduling}
          title={
            schedulingForX
              ? "Scheduling for X is not available yet. Use Threads."
              : "Schedule this post"
          }
          className="flex-1"
          aria-label={scheduling ? "Scheduling post" : "Schedule post"}
        >
          <CalendarClockIcon data-icon="inline-start" />
          {scheduling ? "..." : "Schedule"}
        </Button>
        <Button
          onClick={onPublish}
          disabled={!canPublish}
          className="flex-1"
          aria-label={publishing ? "Publishing post" : "Publish post now"}
        >
          {publishing && <Spinner data-icon="inline-start" />}
          {!publishing && <SendIcon data-icon="inline-start" />}
          {publishing ? "..." : "Publish"}
        </Button>
      </div>
    </div>
  );
}
