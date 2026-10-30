"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/better-auth";
import { actionFetch } from "@/lib/auth/server";

export async function callBackendAction() {
  const res = await actionFetch("/me");
  return (await res.json()) as { name: string; servedAt: string };
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
