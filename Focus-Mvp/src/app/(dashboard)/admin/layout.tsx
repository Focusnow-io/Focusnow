import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
  });

  if (member?.role !== "OWNER" && member?.role !== "ADMIN") redirect("/dashboard");

  return <>{children}</>;
}
