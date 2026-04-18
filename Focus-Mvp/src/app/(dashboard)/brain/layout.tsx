import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePermissions } from "@/lib/permissions";
import { BrainShell } from "@/components/brain/BrainShell";

export default async function BrainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
  });

  const permissions = resolvePermissions(
    member?.role ?? "VIEWER",
    member?.permissions as Record<string, unknown> | null,
  );

  if (!permissions.brain) redirect("/dashboard");

  return <BrainShell>{children}</BrainShell>;
}
