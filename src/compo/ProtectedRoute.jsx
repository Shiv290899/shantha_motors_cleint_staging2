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
    let cancelled = false;
    const token = localStorage.getItem("token");
    (async () => {
      // If no token and no cached user, gate to login quickly
      if (!token && !user) {
        if (!cancelled) setLoading(false);
        return;
      }

      let nextUser = user;
      try {
        const result = await GetCurrentUser();
        if (result?.success && result?.data) {
          nextUser = result.data;
          try { localStorage.setItem("user", JSON.stringify(result.data)); } catch (e) { void e; }
        }
      } catch {
        // ignore fetch errors; fall back to cached user
      } finally {
        if (!cancelled) {
          if (nextUser) setUser(nextUser);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
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
  } else if (Array.isArray(roles) && roles.length && !user) {
    // If a protected role is required but we still don't have a user, block access
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
