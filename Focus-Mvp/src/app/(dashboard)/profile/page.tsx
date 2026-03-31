import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/profile/ProfileForm";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      jobTitle: true,
      companyName: true,
      industry: true,
      primaryFocus: true,
      timezone: true,
      language: true,
      aiAnswerStyle: true,
    },
  });

  if (!user) redirect("/login");

  return (
    <div className="space-y-1 animate-fade-in max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
      <p className="text-sm text-muted-foreground">
        Tell Focus about yourself. This will personalise your experience over time.
      </p>
      <div className="pt-6">
        <ProfileForm initialData={user} />
      </div>
    </div>
  );
}
