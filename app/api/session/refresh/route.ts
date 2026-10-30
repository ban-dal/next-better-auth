import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, RT_COOKIE } from "@/lib/auth/config";
import {
  clearAuthCookies,
  refreshTokens,
  writeAuthCookies,
} from "@/lib/auth/tokens";

const LOOP_GUARD_COOKIE = "refresh_attempted";

// rscFetch가 401을 받았을 때의 fallback. 갱신 후 원래 경로로 돌려보낸다.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("returnTo") ?? "/";
  // 오픈 리다이렉트 방지: 같은 출처의 상대 경로만 허용
  const returnTo = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  const rt = req.cookies.get(RT_COOKIE)?.value;
  // 직전에 갱신했는데도 다시 401로 돌아왔다면 무한 루프를 막기 위해 로그인으로 보낸다.
  const looping = req.cookies.has(LOOP_GUARD_COOKIE);
  const pair = rt && !looping ? await refreshTokens(rt) : null;

  if (!pair) {
    const login = new URL(LOGIN_PATH, req.url);
    login.searchParams.set("next", returnTo);
    const res = NextResponse.redirect(login);
    clearAuthCookies(res.cookies);
    res.cookies.delete({ name: LOOP_GUARD_COOKIE, path: "/api/session" });
    return res;
  }

  const res = NextResponse.redirect(new URL(returnTo, req.url));
  writeAuthCookies(res.cookies, pair);
  res.cookies.set(LOOP_GUARD_COOKIE, "1", {
    httpOnly: true,
    path: "/api/session",
    maxAge: 10,
  });
  return res;
}
