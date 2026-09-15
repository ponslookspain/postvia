"use client";

import Link from "next/link";
import { formatStatusLabel } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_FILTERS = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

function statusHref(option: string): string {
  return option === "all" ? "/posts" : `/posts?status=${option}`;
}

/**
 * Status switcher for the Posts page as segmented Tabs. Selection is
 * URL-driven: every tab is a Link, so the active value always follows
 * `?status=` after navigation. The root remounts per value (key), which
 * keeps the internal tab state in sync without controlled wiring.
 * The list wraps instead of scrolling — no horizontal overflow at any
 * width. Labels and values match the previous underline strip exactly.
 */
export function StatusTabs({ value }: { value: string }) {
  const options = ["all", ...STATUS_FILTERS];
  return (
    <Tabs key={value} defaultValue={value} className="mb-6">
      <TabsList aria-label="Filter posts by status" className="flex w-full flex-wrap sm:w-fit">
        {options.map((option) => (
          <TabsTrigger
            key={option}
            value={option}
            render={
              <Link
                href={statusHref(option)}
                aria-current={value === option ? "page" : undefined}
              />
            }
          >
            {option === "all" ? "All" : formatStatusLabel(option)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
