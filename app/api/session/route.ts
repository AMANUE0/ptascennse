import { NextResponse } from "next/server";
import { currentUser } from "@/lib/server-auth";
import { isAdminUser } from "@/lib/admin-auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
  return NextResponse.json({ email: user.email, isAdmin: isAdminUser(user) });
}
