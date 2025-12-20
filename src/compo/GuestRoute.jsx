import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { GetCurrentUser } from "../apiCalls/users";

// GuestRoute: shows children only if NOT authenticated.
// If authenticated, immediately redirect to dashboard (role-based redirect happens there).
export default function GuestRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    // Be lenient: if a token exists, treat as authenticated and redirect away from guest pages.
    const token = localStorage.getItem("token");
    const cached = (() => { try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; } })();
    if (token || cached) {
      setIsAuthed(true);
      setLoading(false);
      // Refresh user in background but don't force logout on failures
      (async () => {
        try {
          const res = await GetCurrentUser();
          if (res?.success && res?.data) {
            try { localStorage.setItem("user", JSON.stringify(res.data)); } catch {
              //ihihhi
            }
          }
        } catch {
          //gyg
        }
      })();
      return;
    }
    setIsAuthed(false);
    setLoading(false);
  }, []);

  if (loading) return null; // could render a spinner if desired
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
