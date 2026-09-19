"use client";

import { useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseDateKey, toDateKey } from "@/lib/schedule-date";

/**
 * Schedule date field. A real calendar in a popover instead of a native
 * date input: the selected day is filled brand, today is marked, past
 * days are disabled. Reads and writes the same "yyyy-MM-dd" schedule
 * state the confirm dialog and scheduling flow already use.
 */
export function ScheduleDatePicker({
  id,
  value,
  disabled,
  labelledBy,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  labelledBy?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateKey(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarRef = useRef<HTMLDivElement>(null);

  // DayPicker manages its own roving tabindex (one day with tabindex 0)
  // and arrow-key navigation, but a non-modal Popover leaves focus on the
  // trigger — keyboard users could never reach the grid. Move focus to
  // the roving-tabindex day on open so arrows/Enter work immediately.
  function focusInitialDay() {
    const root = calendarRef.current;
    const target =
      root?.querySelector<HTMLElement>(
        'button[tabindex="0"]:not([disabled])'
      ) ?? root?.querySelector<HTMLElement>("button:not([disabled])");
    target?.focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          // Composite name: group label + current value, so SR users hear
          // e.g. "Date, Pick a date" instead of losing the value behind
          // the label alone.
          aria-labelledby={
            labelledBy ? `${labelledBy} ${id}-value` : undefined
          }
          disabled={disabled}
          className="w-full justify-start font-normal"
        >
          <CalendarIcon
            data-icon="inline-start"
            aria-hidden="true"
            className="text-muted-foreground"
          />
          <span
            id={`${id}-value`}
            className={selected ? undefined : "text-muted-foreground"}
          >
            {selected
              ? selected.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Pick a date"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusInitialDay();
        }}
      >
        <div ref={calendarRef}>
          <Calendar
            mode="single"
            weekStartsOn={1}
            selected={selected}
            defaultMonth={selected ?? new Date()}
            disabled={{ before: today }}
            onSelect={(day) => {
              if (!day) return;
              onChange(toDateKey(day));
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
