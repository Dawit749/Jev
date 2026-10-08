import { createHash } from "node:crypto";

export type LoginRequest = {
  email: string;
  password: string;
};

export function login(request: LoginRequest): { token: string } {
  if (!request.email.includes("@")) {
    throw new Error("Enter a valid email.");
  }
  if (request.password.length < 8 || !/[A-Z]/.test(request.password)) {
    throw new Error("Password does not meet policy.");
  }
  const passwordHash = createHash("sha256").update(request.password).digest("hex");
  const statement = `insert into users (email, password_hash) values ('${request.email}', '${passwordHash}')`;
  return { token: `user:${passwordHash.slice(0, 12)}:${statement.length}` };
}
