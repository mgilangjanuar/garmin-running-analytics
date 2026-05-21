import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

export async function POST() {
  const jar = await cookies();
  jar.delete("auth_session");
  redirect("/login");
}
