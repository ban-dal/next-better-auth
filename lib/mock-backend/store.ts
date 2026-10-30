import "server-only";
import { SignJWT } from "jose";
import { JWT_SECRET } from "@/lib/auth/config";
import { MOCK_USERS } from "./users";

// 실제 백엔드를 흉내 내는 인메모리 토큰 서버.
// - AT: HS256 JWT (짧은 TTL)
// - RT: 불투명 랜덤 문자열, 매 refresh마다 rotation
// - 이미 사용된 RT가 다시 오면 같은 family 전체를 폐기 (재사용 감지)

const AT_TTL_SEC = Number(process.env.MOCK_AT_TTL_SEC ?? 30);
const RT_TTL_SEC = Number(process.env.MOCK_RT_TTL_SEC ?? 60 * 60 * 24);

type RefreshRecord = {
  userId: string;
  familyId: string;
  expiresAt: number;
  usedAt: number | null;
};

type Store = {
  refreshTokens: Map<string, RefreshRecord>;
  revokedFamilies: Set<string>;
  stats: { login: number; refresh: number; reuseDetected: number };
};

// dev 서버에서는 route/proxy 번들이 모듈 인스턴스를 따로 가질 수 있어 globalThis에 둔다.
const g = globalThis as typeof globalThis & { __mockBackend?: Store };
const store: Store = (g.__mockBackend ??= {
  refreshTokens: new Map(),
  revokedFamilies: new Set(),
  stats: { login: 0, refresh: 0, reuseDetected: 0 },
});

export type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
};

async function issue(userId: string, familyId: string): Promise<TokenResponse> {
  const user = MOCK_USERS.find((u) => u.id === userId)!;
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({
    email: user.email,
    name: user.name,
    roles: user.roles,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + AT_TTL_SEC)
    .sign(JWT_SECRET);

  const refreshToken = crypto.randomUUID() + crypto.randomUUID();
  const refreshTokenExpiresAt = now + RT_TTL_SEC;
  store.refreshTokens.set(refreshToken, {
    userId,
    familyId,
    expiresAt: refreshTokenExpiresAt * 1000,
    usedAt: null,
  });

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: now + AT_TTL_SEC,
    refreshTokenExpiresAt,
  };
}

export async function login(email: string, password: string) {
  const user = MOCK_USERS.find(
    (u) => u.email === email && u.password === password,
  );
  if (!user) return null;
  store.stats.login++;
  return issue(user.id, crypto.randomUUID());
}

export async function refresh(refreshToken: string) {
  store.stats.refresh++;
  const record = store.refreshTokens.get(refreshToken);
  if (!record || record.expiresAt < Date.now()) return null;
  if (store.revokedFamilies.has(record.familyId)) return null;
  if (record.usedAt) {
    store.stats.reuseDetected++;
    store.revokedFamilies.add(record.familyId);
    return null;
  }
  record.usedAt = Date.now();
  return issue(record.userId, record.familyId);
}

export function logout(refreshToken: string) {
  const record = store.refreshTokens.get(refreshToken);
  if (record) store.revokedFamilies.add(record.familyId);
}

export function isFamilyRevoked(familyId: string) {
  return store.revokedFamilies.has(familyId);
}

export function getStats() {
  return { ...store.stats, revokedFamilies: store.revokedFamilies.size };
}
