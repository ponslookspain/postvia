import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import NewPostComposer from "./NewPostComposer";

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const user = await requireUser();

  return (
    <AppShell user={user}>
      <NewPostComposer userName={user.name} />
    </AppShell>
  );
}