import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { GetCurrentUser } from "../apiCalls/users";

// Goal: keep users "logged in" when navigating back/refreshing as long as a token exists.
// We fall back to cached user from localStorage and refresh it quietly in the background.
export default function ProtectedRoute({ children, roles }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user") || "null"); } catch { return null; }
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    // If no token and no cached user, we can immediately gate to login
    if (!token && !user) { setLoading(false); return; }

    // If we have a token or cached user, do NOT block UI.
    // Let the page render immediately and refresh user in the background.
    setLoading(false);
    (async () => {
      try {
        const result = await GetCurrentUser();
        if (result?.success && result?.data) {
          setUser(result.data);
          try { localStorage.setItem("user", JSON.stringify(result.data)); } catch (e) { void e; }
        }
      } catch {
        // Do NOT clear token/user on transient failures; keep session.
      } finally {
        // nothing
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return null; // could show a spinner

  const tokenPresent = Boolean(localStorage.getItem("token"));
  if (!tokenPresent && !user) return <Navigate to="/login" replace />;

  // Role guard only if we have a user object to infer role from
  if (user && Array.isArray(roles) && roles.length) {
    const role = String(user.role || "").toLowerCase();
    const ok = roles.map((r) => String(r).toLowerCase()).includes(role);
    if (!ok) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
