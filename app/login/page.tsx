import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const authed = await getSession();
  if (authed) redirect("/");

  const { from } = await searchParams;
  const redirectTo = from && from.startsWith("/") ? from : "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workout Analysis</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter your password to continue</p>
        </div>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
