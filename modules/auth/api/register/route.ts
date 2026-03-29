import prisma from "@/lib/db";
import bcrypt from "bcrypt";

export async function POST(req: Request) {
  const body = await req.json();

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      password: hashedPassword
    }
  });

  return Response.json(user);
}
