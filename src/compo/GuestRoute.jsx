import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { GetCurrentUser } from "../apiCalls/users";

// GuestRoute: shows children only if NOT authenticated.
// If authenticated, immediately redirect to dashboard (role-based redirect happens there).
export default function GuestRoute({ children }) {
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const verify = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setIsAuthed(false);
        setLoading(false);
        return;
      }

      try {
        const res = await GetCurrentUser();
        if (res?.success && res?.data) {
          try { localStorage.setItem("user", JSON.stringify(res.data)); } catch {
            // ignore storage failures
          }
          setIsAuthed(true);
        } else {
          try {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
          } catch {
            // ignore
          }
          setIsAuthed(false);
        }
      } catch {
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        } catch {
          // ignore
        }
        setIsAuthed(false);
      } finally {
        setLoading(false);
      }
    };
    verify();
  }, []);

  if (loading) return null; // could render a spinner if desired
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

