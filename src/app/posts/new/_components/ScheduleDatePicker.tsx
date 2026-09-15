"use client";

import { useState } from "react";
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
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateKey(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled}
            className="w-full justify-start font-normal"
          />
        }
      >
        <CalendarIcon
          data-icon="inline-start"
          aria-hidden="true"
          className="text-muted-foreground"
        />
        <span className={selected ? undefined : "text-muted-foreground"}>
          {selected
            ? selected.toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Pick a date"}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
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
      </PopoverContent>
    </Popover>
  );
}
