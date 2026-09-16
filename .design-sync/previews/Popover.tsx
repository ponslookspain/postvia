import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "postvia";
import { CalendarIcon, ChevronsUpDownIcon } from "lucide-react";

/**
 * Popover previews. The composer's date picker (ScheduleDatePicker) is the
 * canonical call site — an outline Button trigger with `align="start"`
 * content. The other cells cover the two other shapes the product uses: a
 * short action popover and an account list. Each is `open` with no
 * `onOpenChange` so the portal content is in the capture.
 */

export function SchedulePicker() {
  return (
    <div style={{ padding: 24, width: 280 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline" style={{ width: "100%" }}>
            <CalendarIcon data-icon="inline-start" aria-hidden="true" />
            Wed 15 May 2024
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Pick a publish day
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <Button variant="ghost" size="sm" style={{ width: "100%" }}>
              Today · 15 May
            </Button>
            <Button variant="ghost" size="sm" style={{ width: "100%" }}>
              Tomorrow · 16 May
            </Button>
            <Button variant="ghost" size="sm" style={{ width: "100%" }}>
              Next Monday · 20 May
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function QuickActions() {
  return (
    <div style={{ padding: 24 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline">Queue options</Button>
        </PopoverTrigger>
        <PopoverContent align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <p style={{ fontSize: 14, fontWeight: 500, lineHeight: "20px" }}>
            12 posts queued
          </p>
          <p
            style={{
              fontSize: 13,
              lineHeight: "18px",
              opacity: 0.66,
              marginTop: 4,
            }}
          >
            The next one goes out on Wednesday at 09:00 to three channels.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button size="sm">Publish next</Button>
            <Button variant="ghost" size="sm">
              Pause queue
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function AccountSwitcher() {
  const accounts = [
    { initial: "PV", handle: "@postvia.studio", platform: "Instagram" },
    { initial: "PT", handle: "@postvia", platform: "Threads" },
    { initial: "PX", handle: "@postvia_app", platform: "X" },
  ];
  return (
    <div style={{ padding: 24, width: 280 }}>
      <Popover open>
        <PopoverTrigger asChild>
          <Button variant="outline" style={{ width: "100%" }}>
            @postvia.studio
            <ChevronsUpDownIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accounts.map((a) => (
              <div
                key={a.handle}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Avatar size="32">
                  <AvatarFallback>{a.initial}</AvatarFallback>
                </Avatar>
                <div style={{ minWidth: 0, flex: 1, fontSize: 13 }}>
                  <p style={{ fontWeight: 500, lineHeight: "18px" }}>
                    {a.handle}
                  </p>
                  <p style={{ opacity: 0.66, lineHeight: "16px" }}>
                    {a.platform}
                  </p>
                </div>
                {a.platform === "Instagram" && (
                  <Badge variant="soft" color="success" size="20">
                    Active
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
