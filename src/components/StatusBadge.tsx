import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT = {
  DRAFT: "ghost",
  SCHEDULED: "outline",
  PUBLISHING: "secondary",
  PUBLISHED: "default",
  PARTIALLY_PUBLISHED: "secondary",
  FAILED: "destructive",
} as const;

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANT[status as keyof typeof STATUS_VARIANT] ?? "ghost"}>
      {status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ")}
    </Badge>
  );
}
