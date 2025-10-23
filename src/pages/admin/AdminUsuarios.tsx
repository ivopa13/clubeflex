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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) throw new Error("Não autenticado");

      const { data, error } = await supabase.functions.invoke("list-users", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      return data.users;
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('assign-role', {
        body: { userId, role: role as 'admin' | 'customer' | 'specifier' },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Role atribuído com sucesso!');
      setSelectedRoles({});
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao atribuir role');
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
                            {assignRoleMutation.isPending ? 'Salvando...' : 'Salvar'}
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
