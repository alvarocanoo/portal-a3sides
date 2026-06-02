import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!isPublic && !sessionToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublic && sessionToken && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  return response;
}

export const config = {
  matcher: [
    // Excluimos:
    //   _next/static, _next/image, favicon.ico → assets internos de Next.
    //   .*\..* → cualquier ruta con extension (logoa3sides.png, logo.svg,
    //   robots.txt, etc.). Sin esto, el middleware redirige los estaticos
    //   de /public a /login cuando el usuario no esta autenticado, y el
    //   navegador recibe HTML donde esperaba binario → imagen rota.
    //
    //   OJO: "public" como token aqui era inutil porque Next sirve los
    //   ficheros de /public en la raiz (/logoa3sides.png, no /public/...).
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
