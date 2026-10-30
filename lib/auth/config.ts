const isProd = process.env.NODE_ENV === "production";

export const BACKEND_URL =
  process.env.AUTH_BACKEND_URL ?? "http://localhost:3000/mock-backend";

// 실제 백엔드라면 createRemoteJWKSet(new URL(".../.well-known/jwks.json"))로 교체한다.
export const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_JWT_SECRET ?? "dev-only-jwt-secret-change-me-32bytes!!",
);

// production에서는 __Host- 접두사(Secure + Path=/ + Domain 없음 강제)를 쓴다.
export const AT_COOKIE = isProd ? "__Host-at" : "at";
export const RT_COOKIE = isProd ? "__Host-rt" : "rt";
export const COOKIE_SECURE = isProd;

// AT 만료까지 남은 시간이 이 값보다 작으면 proxy가 미리 갱신한다.
export const REFRESH_SKEW_SEC = Number(process.env.AUTH_REFRESH_SKEW_SEC ?? 60);

// rotation 직후 옛 RT로 들어온 요청에 같은 새 토큰을 돌려주는 시간.
export const REFRESH_GRACE_MS = 30_000;

export const LOGIN_PATH = "/login";
export const PROTECTED_PREFIXES = ["/dashboard"];

// rscFetch가 401 시 돌아올 경로를 알 수 있도록 proxy가 넣어 주는 요청 헤더.
export const PATHNAME_HEADER = "x-pathname";
