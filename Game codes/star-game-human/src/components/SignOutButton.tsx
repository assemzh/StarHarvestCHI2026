"use client";
import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";

export function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  if (!isAuthenticated) {
    return null;
  }

  const handleSignOut = () => {
    signOut();
  };

  return (
    <button
      className="px-4 py-2 rounded bg-red-600 text-white border border-red-500 font-semibold hover:bg-red-700 hover:border-red-600 transition-colors shadow-sm hover:shadow"
      onClick={handleSignOut}
    >
      Sign Out
    </button>
  );
}
