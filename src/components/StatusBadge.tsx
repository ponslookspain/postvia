import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/lib/utils";

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
      {formatStatusLabel(status)}
    </Badge>
  );
}
