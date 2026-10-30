"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth/better-auth";

export type SignInState = { error?: string };

export async function signInAction(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = String(formData.get("next") ?? "/dashboard");
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  try {
    // nextCookies 플러그인이 플러그인 엔드포인트의 Set-Cookie를 cookies()로 옮긴다.
    await auth.api.signInEmail({
      body: {
        email: String(formData.get("email")),
        password: String(formData.get("password")),
      },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) return { error: error.message };
    throw error;
  }
  redirect(next);
}
