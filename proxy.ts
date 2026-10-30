import { NextResponse, type NextRequest } from "next/server";
import {
  AT_COOKIE,
  LOGIN_PATH,
  PATHNAME_HEADER,
  PROTECTED_PREFIXES,
  REFRESH_SKEW_SEC,
  RT_COOKIE,
} from "@/lib/auth/config";
import {
  clearAuthCookies,
  expiresWithin,
  refreshTokens,
  writeAuthCookies,
} from "@/lib/auth/tokens";

// RSC는 쿠키를 쓸 수 없으므로 AT 갱신은 렌더링 전에 여기서 끝낸다.
// 최종 인가는 DAL(requireSession)과 백엔드가 담당하고, 여기서는 낙관적 검사만 한다.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const at = req.cookies.get(AT_COOKIE)?.value;
  const rt = req.cookies.get(RT_COOKIE)?.value;
  // Server Action(POST)은 redirect 응답을 처리하지 못하므로 통과시키고 Action 안에서 처리한다.
  const guard =
    req.method === "GET" && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  if (at && !expiresWithin(at, REFRESH_SKEW_SEC)) return pass(req);
  if (!rt) {
    const usable = at && !expiresWithin(at, 0);
    return guard && !usable ? toLogin(req) : pass(req);
  }

  const pair = await refreshTokens(rt);
  if (!pair) {
    req.cookies.delete(AT_COOKIE);
    req.cookies.delete(RT_COOKIE);
    const res = guard ? toLogin(req) : pass(req);
    clearAuthCookies(res.cookies);
    return res;
  }

  // 같은 요청에서 렌더링되는 RSC/Action이 새 AT를 읽도록 요청 쿠키도 교체한다.
  req.cookies.set(AT_COOKIE, pair.accessToken);
  req.cookies.set(RT_COOKIE, pair.refreshToken);
  const res = pass(req);
  writeAuthCookies(res.cookies, pair);
  return res;
}

function pass(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATHNAME_HEADER, req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

function toLogin(req: NextRequest) {
  const url = new URL(LOGIN_PATH, req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|mock-backend|api/auth|api/session).*)",
  ],
};
