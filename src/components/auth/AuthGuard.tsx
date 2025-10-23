import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Session } from "@supabase/supabase-js";

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const AuthGuard = ({ children, allowedRoles }: AuthGuardProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasRole, setHasRole] = useState(false);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }

      if (allowedRoles && allowedRoles.length > 0) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (!roles || roles.length === 0) {
          navigate("/auth");
          return;
        }

        const userRoles = roles.map((r) => r.role as string);
        const hasAllowedRole = allowedRoles.some((role) => userRoles.includes(role));

        if (!hasAllowedRole) {
          navigate("/auth");
          return;
        }

        setHasRole(true);
      } else {
        setHasRole(true);
      }

      setLoading(false);
    };

    checkAuth();
  }, [user, allowedRoles, navigate]);

  if (loading || !hasRole) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
};
