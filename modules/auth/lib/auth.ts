import jwt from "jsonwebtoken";

export function generateToken(userId: string) {
  return jwt.sign(
    { userId },
    "SECRET_KEY",
    { expiresIn: "7d" }
  );
}
