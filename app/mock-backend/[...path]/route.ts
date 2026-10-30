import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { JWT_SECRET } from "@/lib/auth/config";
import { getStats, login, logout, refresh } from "@/lib/mock-backend/store";

// 외부 백엔드 API를 흉내 내는 엔드포인트. proxy matcher에서 제외되어 있다.
//   POST /mock-backend/auth/login    { email, password } → TokenResponse
//   POST /mock-backend/auth/refresh  { refreshToken }    → TokenResponse (rotation)
//   POST /mock-backend/auth/logout   { refreshToken }
//   GET  /mock-backend/me            Authorization: Bearer <AT>
//   GET  /mock-backend/stats

const unauthorized = () =>
  Response.json({ error: "unauthorized" }, { status: 401 });

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/mock-backend/[...path]">,
) {
  const path = (await ctx.params).path.join("/");
  const body = await req.json().catch(() => ({}));

  switch (path) {
    case "auth/login": {
      const tokens = await login(body.email, body.password);
      return tokens ? Response.json(tokens) : unauthorized();
    }
    case "auth/refresh": {
      const tokens = await refresh(body.refreshToken);
      return tokens ? Response.json(tokens) : unauthorized();
    }
    case "auth/logout": {
      logout(body.refreshToken);
      return new Response(null, { status: 204 });
    }
    default:
      return Response.json({ error: "not found" }, { status: 404 });
  }
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/mock-backend/[...path]">,
) {
  const path = (await ctx.params).path.join("/");

  switch (path) {
    case "me": {
      const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
      if (!token) return unauthorized();
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return Response.json({
          id: payload.sub,
          email: payload.email,
          name: payload.name,
          servedAt: new Date().toISOString(),
        });
      } catch {
        return unauthorized();
      }
    }
    case "stats":
      return Response.json(getStats());
    default:
      return Response.json({ error: "not found" }, { status: 404 });
  }
}
