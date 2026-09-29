import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";

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
  let allowed = isAdminUser(user) || Boolean(user.user_metadata?.invited);
  // Authenticated checkout is authorized independently; panel access still
  // requires an invitation, an active membership, or an owned paid service.
  if (pathname === "/api/orders") return response;
  if (!allowed) {
    const [membership, purchase] = await Promise.all([
      supabase.from("server_members").select("server_id").eq("user_id", user.id).eq("active", true).limit(1),
      supabase.from("hosting_orders").select("id").eq("user_id", user.id).eq("payment_status", "paid").eq("provisioning_status", "ready").limit(1),
    ]);
    allowed = (!membership.error && Boolean(membership.data?.length)) || (!purchase.error && Boolean(purchase.data?.length));
  }
  if (!allowed) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Esta cuenta no tiene acceso" }, { status: 403 });
    return NextResponse.redirect(new URL("/auth?error=not_allowed", request.url));
  }
  if (pathname.startsWith("/admin") && !isAdminUser(user)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
    return NextResponse.redirect(new URL("/panel", request.url));
  }
  return response;
}
export const config = { matcher: ["/((?!api/auth/callback).*)"] };
