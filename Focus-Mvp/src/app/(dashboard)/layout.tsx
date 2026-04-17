import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/ui/toast";
import { resolvePermissions } from "@/lib/permissions";
import { InactivityProvider } from "@/components/providers/InactivityProvider";
import { WelcomeModal } from "@/components/dashboard/WelcomeModal";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  });

  if (!member) redirect("/onboarding");

  const permissions = resolvePermissions(
    member?.role ?? "VIEWER",
    member?.permissions as Record<string, unknown> | null
  );

  return (
    <InactivityProvider>
      <WelcomeModal role={member?.role ?? "VIEWER"} />
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          userName={session.user.name}
          orgName={member?.organization.name}
          userRole={member?.role}
          permissions={permissions}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            userName={session.user.name}
            orgName={member?.organization.name}
          />
          <main className="flex-1 overflow-y-auto p-6 bg-background transition-colors duration-150">
            <ToastProvider>
              {children}
            </ToastProvider>
          </main>
        </div>
      </div>
    </InactivityProvider>
  );
}
