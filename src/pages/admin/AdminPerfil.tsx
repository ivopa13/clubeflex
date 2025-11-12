import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User, Shield } from "lucide-react";

export default function AdminPerfil() {
  const { data: userData, isLoading } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("Usuário não encontrado");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesError) throw rolesError;

      return {
        user,
        profile,
        roles: roles?.map(r => r.role) || [],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Não foi possível carregar seus dados.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Perfil do Administrador</h1>
        <p className="text-muted-foreground mt-2">
          Informações da sua conta administrativa
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Informações da Conta
          </CardTitle>
          <CardDescription>
            Dados do usuário administrativo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Email
              </label>
              <p className="text-foreground font-medium mt-1">
                {userData.user.email}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Nome
              </label>
              <p className="text-foreground font-medium mt-1">
                {userData.profile?.full_name || "Não informado"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Tipo de Conta
              </label>
              <p className="text-foreground font-medium mt-1 flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Administrador
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Cadastrado em
              </label>
              <p className="text-foreground font-medium mt-1">
                {new Date(userData.user.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">
                Permissões
              </label>
              <div className="flex gap-2 mt-1">
                {userData.roles.map((role) => (
                  <span
                    key={role}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informações do Sistema</CardTitle>
          <CardDescription>
            Detalhes técnicos da conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              User ID
            </label>
            <p className="text-xs text-foreground font-mono mt-1 bg-muted p-2 rounded">
              {userData.user.id}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              Último Acesso
            </label>
            <p className="text-foreground mt-1">
              {userData.user.last_sign_in_at 
                ? new Date(userData.user.last_sign_in_at).toLocaleString("pt-BR")
                : "Não disponível"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
