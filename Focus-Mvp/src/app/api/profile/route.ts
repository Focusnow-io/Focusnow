import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, badRequest } from "@/lib/api-helpers";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100),
  jobTitle: z.string().max(100).optional().nullable(),
  companyName: z.string().min(1).max(100),
  industry: z.string().max(50).optional().nullable(),
  primaryFocus: z.array(z.string()).optional(),
  timezone: z.string().max(50).optional().nullable(),
  language: z.string().max(10).optional().nullable(),
  aiAnswerStyle: z.enum(["concise", "detailed"]).optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
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

  if (!user) return unauthorized();
  return NextResponse.json(user);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: parsed.data,
    select: { id: true },
  });

  return NextResponse.json({ success: true, id: updated.id });
}
