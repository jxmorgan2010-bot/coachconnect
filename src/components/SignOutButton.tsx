"use client";

import { useState } from "react";
import { signOutToHome } from "@/lib/authClient";

/** Signs out and reloads the home page; says so if the session is still there afterwards. */
export default function SignOutButton({
  className,
  wrapperClassName = "",
  floatingError = false,
}: {
  className: string;
  wrapperClassName?: string;
  /** Show the error below the button without changing the layout (the desktop header row). */
  floatingError?: boolean;
}) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  return (
    <div className={`relative flex flex-col gap-1.5 ${wrapperClassName}`}>
      <button
        type="button"
        className={className}
        disabled={state === "working"}
        onClick={async () => {
          setState("working");
          // On success the page reloads, so only failure needs handling here.
          if (!(await signOutToHome())) setState("failed");
        }}
      >
        {state === "working" ? "Signing out..." : "Sign out"}
      </button>
      {state === "failed" && (
        <p
          role="alert"
          className={`text-xs font-semibold text-danger ${
            floatingError ? "absolute right-0 top-full mt-2 whitespace-nowrap rounded-md border-2 border-danger bg-chalk px-2 py-1" : ""
          }`}
        >
          Couldn&apos;t sign out. Please try again.
        </p>
      )}
    </div>
  );
}
