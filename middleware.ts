import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/" || pathname === "/planes" || pathname === "/planes/resultado" || pathname.startsWith("/auth") || pathname === "/api/catalog/versions" || pathname === "/api/payments/config" || pathname === "/api/payments/mercadopago/webhook") return NextResponse.next();
  
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) return NextResponse.redirect(new URL("/auth?error=missing_supabase_config", request.url));
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Debes iniciar sesión" }, { status: 401 });
    return NextResponse.redirect(new URL(`/auth?next=${encodeURIComponent(pathname)}`, request.url));
  }
  const allowed = user.email?.toLowerCase() === "000balderas@gmail.com" || Boolean(user.user_metadata?.invited) || Boolean(user.user_metadata?.fullName);
  if (!allowed) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Esta cuenta no tiene acceso" }, { status: 403 });
    return NextResponse.redirect(new URL("/auth?error=not_allowed", request.url));
  }
  if (pathname.startsWith("/admin") && user.app_metadata?.role !== "admin" && user.email?.toLowerCase() !== "000balderas@gmail.com") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    return NextResponse.redirect(new URL("/panel", request.url));
  }
  return response;
}
export const config = { matcher: ["/((?!api/auth/callback).*)"] };
