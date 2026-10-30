import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { backendApi } from "./backend-api";
import { AT_COOKIE, LOGIN_PATH, PATHNAME_HEADER, RT_COOKIE } from "./config";
import {
  clearAuthCookies,
  refreshTokens,
  sessionFromClaims,
  verifyAccessToken,
  writeAuthCookies,
} from "./tokens";

// RSC와 Server Action에서 쓰는 진입점. 세션 조회(DAL)와 백엔드 호출을 제공한다.

// 백엔드 호출 전용. 이 값을 컴포넌트 props나 'use cache' 인자로 넘기지 않는다.
const getAccessToken = cache(
  async () => (await cookies()).get(AT_COOKIE)?.value ?? null,
);

// ─── 세션 (DAL) ───────────────────────────────────────────────

export const getSession = cache(async () => {
  const token = await getAccessToken();
  const claims = token ? await verifyAccessToken(token) : null;
  return claims ? sessionFromClaims(claims) : null;
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect(LOGIN_PATH);
  return session;
}

// ─── 백엔드 호출 ──────────────────────────────────────────────

// RSC 전용. RSC는 쿠키를 쓸 수 없으므로 401이면 refresh Route Handler로 보내고 원래 경로로 돌아온다.
export async function rscFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = token ? await backendApi.request(path, token, init) : null;
  if (res && res.status !== 401) return res;

  const returnTo = (await headers()).get(PATHNAME_HEADER) ?? "/";
  redirect(`/api/session/refresh?returnTo=${encodeURIComponent(returnTo)}`);
}

// Server Action / Route Handler 전용. 401이면 직접 갱신하고 쿠키를 쓴 뒤 1회 재시도한다.
export async function actionFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const res = token ? await backendApi.request(path, token, init) : null;
  if (res && res.status !== 401) return res;

  const store = await cookies();
  const rt = store.get(RT_COOKIE)?.value;
  const pair = rt ? await refreshTokens(rt) : null;
  if (!pair) {
    clearAuthCookies(store);
    redirect(LOGIN_PATH);
  }
  writeAuthCookies(store, pair);
  return backendApi.request(path, pair.accessToken, init);
}
