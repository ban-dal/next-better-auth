import { decodeJwt, jwtVerify } from "jose";
import { backendApi, type TokenPair } from "./backend-api";
import {
  AT_COOKIE,
  COOKIE_SECURE,
  JWT_SECRET,
  REFRESH_GRACE_MS,
  RT_COOKIE,
} from "./config";

// 토큰 판독·검증, 쿠키 읽기/쓰기, refresh. proxy, Route Handler, Server Action, better-auth 플러그인이 공유한다.

// ─── AT 판독 / 검증 ────────────────────────────────────────────

export type AccessTokenClaims = {
  sub: string;
  email: string;
  name: string;
  roles: string[];
  exp: number;
};

// 서명 검증 없이 exp만 본다. proxy의 갱신 시점 판단 전용.
export function expiresWithin(token: string, seconds: number, now = Date.now()) {
  let exp: number | undefined;
  try {
    exp = decodeJwt(token).exp;
  } catch {
    return true;
  }
  return exp === undefined || exp * 1000 - now <= seconds * 1000;
}

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AccessTokenClaims;
  } catch {
    return null;
  }
}

// DAL과 better-auth get-session이 같은 형태를 돌려주도록 한 곳에서 만든다. 토큰은 포함하지 않는다.
export type Session = ReturnType<typeof sessionFromClaims>;

export function sessionFromClaims(claims: AccessTokenClaims) {
  return {
    user: {
      id: claims.sub,
      email: claims.email,
      name: claims.name,
      roles: claims.roles,
    },
    session: {
      userId: claims.sub,
      expiresAt: new Date(claims.exp * 1000),
    },
  };
}

// ─── 쿠키 ─────────────────────────────────────────────────────

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
};

// proxy의 ResponseCookies와 Server Action의 cookies() 모두 이 형태를 만족한다.
type CookieWriter = {
  set(name: string, value: string, options?: CookieOptions): unknown;
  delete(name: string): unknown;
};

const baseCookie = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
} as const;

const secondsUntil = (expSec: number) =>
  Math.max(0, expSec - Math.floor(Date.now() / 1000));

export function authCookieEntries(pair: TokenPair) {
  return [
    {
      name: AT_COOKIE,
      value: pair.accessToken,
      options: { ...baseCookie, maxAge: secondsUntil(pair.accessTokenExpiresAt) },
    },
    {
      name: RT_COOKIE,
      value: pair.refreshToken,
      options: { ...baseCookie, maxAge: secondsUntil(pair.refreshTokenExpiresAt) },
    },
  ];
}

export function writeAuthCookies(store: CookieWriter, pair: TokenPair) {
  for (const { name, value, options } of authCookieEntries(pair)) {
    store.set(name, value, options);
  }
}

export function clearAuthCookies(store: CookieWriter) {
  store.delete(AT_COOKIE);
  store.delete(RT_COOKIE);
}

// ─── Refresh (single-flight) ──────────────────────────────────

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("base64url");
}

// 같은 RT로 동시에 들어온 refresh를 백엔드 호출 1회로 합친다.
// - inflight: 진행 중인 호출을 공유
// - recent: 끝난 뒤 grace 시간 동안 옛 RT에 같은 새 토큰을 돌려줘 rotation 재사용 감지를 피한다
// 프로세스 메모리 기반이므로 멀티 인스턴스에서는 Redis 등 공유 저장소나 백엔드 grace window가 필요하다.
export function createRefresher(
  call: (refreshToken: string) => Promise<TokenPair | null>,
  graceMs = REFRESH_GRACE_MS,
) {
  const inflight = new Map<string, Promise<TokenPair | null>>();
  const recent = new Map<string, { pair: TokenPair; until: number }>();

  return async function refreshTokens(refreshToken: string) {
    const key = await sha256(refreshToken);
    const now = Date.now();
    for (const [k, entry] of recent) if (entry.until <= now) recent.delete(k);

    const hit = recent.get(key);
    if (hit) return hit.pair;

    let pending = inflight.get(key);
    if (!pending) {
      pending = call(refreshToken)
        .catch(() => null)
        .then((pair) => {
          if (pair) recent.set(key, { pair, until: Date.now() + graceMs });
          return pair;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    return pending;
  };
}

// proxy와 앱 번들이 같은 프로세스에서 상태를 공유하도록 globalThis에 둔다.
const g = globalThis as typeof globalThis & {
  __refreshTokens?: ReturnType<typeof createRefresher>;
};
export const refreshTokens = (g.__refreshTokens ??= createRefresher(
  backendApi.refresh,
));
