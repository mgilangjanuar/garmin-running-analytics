import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:placeholder:text-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
