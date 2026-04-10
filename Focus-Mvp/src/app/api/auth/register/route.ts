import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateOrgSlug } from "@/lib/utils";
import { sendEmailVerification } from "@/lib/otp";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  orgName: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const { name, email, password, orgName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = generateOrgSlug(orgName);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        // emailVerified intentionally left null — requires email confirmation
        memberships: {
          create: {
            role: "OWNER",
            organization: {
              create: { name: orgName, slug },
            },
          },
        },
      },
    });

    // Derive base URL from the request's origin
    const origin = new URL(req.url).origin;
    await sendEmailVerification(user.id, email, origin);

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[REGISTER] Error creating account:", error);
    return NextResponse.json(
      { error: "Failed to create workspace. Please try again." },
      { status: 500 }
    );
  }
}
