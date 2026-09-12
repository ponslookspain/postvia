"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { formatStatusLabel } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_OPTIONS = [
  "all",
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

export function DashboardPostFilter({
  q,
  status,
}: {
  q: string;
  status: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  function push(nextQ: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextQ.trim()) params.set("q", nextQ.trim());
    if (nextStatus !== "all") params.set("status", nextStatus);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function currentQ(): string {
    if (!formRef.current) return q;
    const data = new FormData(formRef.current);
    return String(data.get("q") ?? "");
  }

  const isFiltered = q !== "" || status !== "all";

  return (
    <div className="mb-4 flex flex-col gap-2">
      <form
        ref={formRef}
        role="search"
        aria-label="Filter recent posts"
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          push(currentQ(), status);
        }}
      >
        <div className="relative flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search recent posts…"
            aria-label="Search recent posts"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value: unknown) => push(currentQ(), String(value))}
        >
          <SelectTrigger
            aria-label="Filter by status"
            className="w-full sm:w-44"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {formatStatusLabel(option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </form>
      {isFiltered && (
        <Link
          href="/dashboard"
          className="w-fit rounded-sm text-xs text-muted-foreground underline outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
