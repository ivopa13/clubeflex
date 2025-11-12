import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Edit, Loader2 } from "lucide-react";

const formatCpfCnpj = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  
  if (numbers.length <= 11) {
    // CPF: 000.000.000-00
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // CNPJ: 00.000.000/0000-00
    return numbers
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
};

const removeMask = (value: string) => value.replace(/\D/g, "");

const AdminUsuarios = () => {
  const queryClient = useQueryClient();
  const [selectedRoles, setSelectedRoles] = useState<{ [key: string]: string }>({});
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    userId: string | null;
    data: { full_name: string; email: string; doc: string };
  }>({
    open: false,
    userId: null,
    data: { full_name: "", email: "", doc: "" },
  });

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

  const linkUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const { data, error } = await supabase.functions.invoke('link-user-to-actor', {
        body: { userId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`Vinculado a ${data.linkedTo}: ${data.actorName}`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao vincular usuário');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { full_name: string; email: string; doc: string } }) => {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          full_name: data.full_name.trim(),
          email: data.email.trim(),
          doc: data.doc.trim() || null,
        }, {
          onConflict: 'id'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Usuário atualizado com sucesso!");
      setEditDialog({ open: false, userId: null, data: { full_name: "", email: "", doc: "" } });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
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

  const handleEdit = (user: any) => {
    setEditDialog({
      open: true,
      userId: user.id,
      data: {
        full_name: user.full_name || "",
        email: user.email || "",
        doc: user.doc ? formatCpfCnpj(user.doc) : "",
      },
    });
  };

  const handleSaveUser = () => {
    if (!editDialog.userId) return;
    
    if (!editDialog.data.full_name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    
    if (!editDialog.data.email.trim()) {
      toast.error("Email é obrigatório");
      return;
    }

    updateUserMutation.mutate({
      userId: editDialog.userId,
      data: {
        full_name: editDialog.data.full_name,
        email: editDialog.data.email,
        doc: removeMask(editDialog.data.doc),
      },
    });
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
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Role Atual</TableHead>
                  <TableHead>Atribuir Role</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user: any) => {
                  const currentRole = user.role ? roleMap[user.role as keyof typeof roleMap] : null;
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.email}</TableCell>
                      <TableCell>{user.full_name || "-"}</TableCell>
                      <TableCell>{user.doc ? formatCpfCnpj(user.doc) : "-"}</TableCell>
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
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(user)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {user.doc && !currentRole && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => linkUserMutation.mutate(user.id)}
                              disabled={linkUserMutation.isPending}
                              title="Vincular ao customer/specifier pelo CPF/CNPJ"
                            >
                              {linkUserMutation.isPending ? '...' : 'Vincular'}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialog.open} onOpenChange={(open) => !updateUserMutation.isPending && setEditDialog({ ...editDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize os dados do usuário
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={editDialog.data.email}
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  data: { ...editDialog.data, email: e.target.value }
                })}
                placeholder="email@exemplo.com"
                disabled={updateUserMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={editDialog.data.full_name}
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  data: { ...editDialog.data, full_name: e.target.value }
                })}
                placeholder="Nome completo"
                disabled={updateUserMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc">CPF/CNPJ</Label>
              <Input
                id="doc"
                value={editDialog.data.doc}
                onChange={(e) => {
                  const formatted = formatCpfCnpj(e.target.value);
                  setEditDialog({
                    ...editDialog,
                    data: { ...editDialog.data, doc: formatted }
                  });
                }}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                disabled={updateUserMutation.isPending}
                maxLength={18}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog({ open: false, userId: null, data: { full_name: "", email: "", doc: "" } })}
              disabled={updateUserMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveUser}
              disabled={updateUserMutation.isPending}
            >
              {updateUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsuarios;
