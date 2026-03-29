import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set in environment variables.\n" +
    "Add JWT_SECRET to your .env file."
  );
}

export function generateToken(userId: string): string {
  return jwt.sign(
    { userId },
    JWT_SECRET as string,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as { userId: string };
  } catch {
    return null;
  }
}
