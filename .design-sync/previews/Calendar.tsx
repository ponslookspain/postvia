import { Calendar } from "postvia";

/**
 * Calendar previews. The product uses this inside a Popover as the schedule
 * date picker (ScheduleDatePicker.tsx): `weekStartsOn={1}`, a selected day and
 * `disabled={{ before: today }}` so a post cannot be scheduled into the past.
 * Every cell pins `month` and `today` so the capture is deterministic rather
 * than relative to the render date.
 */

const MONTH = new Date(2026, 8, 1); // September 2026
const TODAY = new Date(2026, 8, 16);
const SELECTED = new Date(2026, 8, 18);

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--color-muted-foreground, #6b7280)",
};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  width: "fit-content",
};

export function ScheduleDate() {
  return (
    <div style={stack}>
      <Calendar
        mode="single"
        weekStartsOn={1}
        month={MONTH}
        today={TODAY}
        selected={SELECTED}
      />
    </div>
  );
}

export function PastDisabled() {
  return (
    <div style={stack}>
      <span style={caption}>disabled=&#123;&#123; before: today &#125;&#125;</span>
      <Calendar
        mode="single"
        weekStartsOn={1}
        month={MONTH}
        today={TODAY}
        selected={SELECTED}
        disabled={{ before: TODAY }}
      />
    </div>
  );
}

export function Range() {
  return (
    <div style={stack}>
      <span style={caption}>mode="range" — a bulk scheduling window</span>
      <Calendar
        mode="range"
        weekStartsOn={1}
        month={MONTH}
        today={TODAY}
        selected={{ from: new Date(2026, 8, 14), to: new Date(2026, 8, 22) }}
      />
    </div>
  );
}

export function NoOutsideDays() {
  return (
    <div style={stack}>
      <span style={caption}>showOutsideDays=&#123;false&#125;</span>
      <Calendar
        mode="single"
        weekStartsOn={1}
        month={MONTH}
        today={TODAY}
        selected={SELECTED}
        showOutsideDays={false}
      />
    </div>
  );
}
