import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserPlus } from "lucide-react";

const AdminUsuarios = () => {
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<{ [key: string]: string }>({});

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Buscar todos os usuários do auth
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) throw authError;

      // Buscar os roles de cada usuário
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Combinar dados
      const usersWithRoles = authUsers.users.map((user) => {
        const role = userRoles?.find((r) => r.user_id === user.id);
        return {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name,
          role: role?.role || null,
          created_at: user.created_at,
        };
      });

      return usersWithRoles;
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // Primeiro, remover qualquer role existente
      await supabase.from("user_roles").delete().eq("user_id", userId);

      // Inserir o novo role
      const { error } = await supabase
        .from("user_roles")
        .insert([{ user_id: userId, role: role as "admin" | "customer" | "specifier" }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Role atribuído com sucesso!");
      setSelectedRoles({});
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atribuir role");
    },
  });

  const handleAssignRole = (userId: string) => {
    const role = selectedRoles[userId];
    if (!role) {
      toast.error("Selecione um role");
      return;
    }
    assignRoleMutation.mutate({ userId, role });
  };

  const roleMap = {
    admin: { label: "Administrador", variant: "destructive" as const },
    customer: { label: "Cliente", variant: "default" as const },
    specifier: { label: "Especificador", variant: "secondary" as const },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Gerenciar Usuários</h1>

      <Card>
        <CardHeader>
          <CardTitle>Usuários do Sistema</CardTitle>
          <CardDescription>Atribuir roles aos usuários cadastrados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role Atual</TableHead>
                  <TableHead>Atribuir Role</TableHead>
                  <TableHead>Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user: any) => {
                  const currentRole = user.role ? roleMap[user.role as keyof typeof roleMap] : null;
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name || "-"}</TableCell>
                      <TableCell>
                        {currentRole ? (
                          <Badge variant={currentRole.variant}>{currentRole.label}</Badge>
                        ) : (
                          <Badge variant="outline">Sem role</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Select
                            value={selectedRoles[user.id] || ""}
                            onValueChange={(value) => 
                              setSelectedRoles({ ...selectedRoles, [user.id]: value })
                            }
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Selecionar role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="customer">Cliente</SelectItem>
                              <SelectItem value="specifier">Especificador</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => handleAssignRole(user.id)}
                            disabled={!selectedRoles[user.id] || assignRoleMutation.isPending}
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(user.created_at), "dd/MM/yy", { locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUsuarios;
