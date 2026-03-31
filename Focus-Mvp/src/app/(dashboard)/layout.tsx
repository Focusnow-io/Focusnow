import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { ToastProvider } from "@/components/ui/toast";

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        userName={session.user.name}
        orgName={member?.organization.name}
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
  );
}
