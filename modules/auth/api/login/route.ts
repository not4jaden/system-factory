import prisma from "@/lib/db";
import bcrypt from "bcrypt";
import { generateToken } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json();

  const user = await prisma.user.findUnique({
    where: { email: body.email }
  });

  if (!user) {
    return Response.json({ error: "User not found" });
  }

  const valid = await bcrypt.compare(body.password, user.password);

  if (!valid) {
    return Response.json({ error: "Invalid password" });
  }

  const token = generateToken(user.id);

  return Response.json({ token });
}
