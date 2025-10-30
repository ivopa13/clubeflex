import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Session } from "@supabase/supabase-js";
import logoFlex from "@/assets/logo-flex.png";

const Index = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);

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
    if (user) {
      // Redirect to appropriate dashboard based on role
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .then(({ data: roles }) => {
          if (!roles || roles.length === 0) return;
          
          const hasAdminRole = roles.some(r => r.role === "admin");
          if (hasAdminRole) {
            navigate("/admin");
          } else if (roles.some(r => r.role === "specifier" || r.role === "customer")) {
            navigate("/portal");
          }
        });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ 
      background: 'var(--gradient-hero)' 
    }}>
      <Card className="w-full max-w-2xl shadow-[var(--shadow-card)]">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center mb-4">
            <img src={logoFlex} alt="Flex Logo" className="h-24 w-auto" />
          </div>
          <CardTitle className="text-5xl font-bold">Flex Fidelidade</CardTitle>
          <CardDescription className="text-lg">
            Programa de Pontos para Materiais de Construção
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 text-center">
            <p className="text-muted-foreground">
              Acumule pontos a cada compra e resgate produtos exclusivos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
              <div className="p-4 rounded-lg bg-muted">
                <h3 className="font-semibold mb-2">1 Real = 1 Ponto</h3>
                <p className="text-sm text-muted-foreground">
                  Ganhe pontos em todas as suas compras
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <h3 className="font-semibold mb-2">Resgate Fácil</h3>
                <p className="text-sm text-muted-foreground">
                  Troque seus pontos por produtos
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <h3 className="font-semibold mb-2">Especificadores</h3>
                <p className="text-sm text-muted-foreground">
                  Profissionais também ganham pontos
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
            >
              Acessar Portal
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
