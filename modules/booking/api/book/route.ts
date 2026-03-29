import prisma from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json();

  const booking = await prisma.booking.create({
    data: {
      userId: body.userId,
      date: new Date(body.date)
    }
  });

  return Response.json(booking);
}
