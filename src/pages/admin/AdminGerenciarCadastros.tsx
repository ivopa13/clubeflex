import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit, Loader2, Search } from "lucide-react";

interface Customer {
  id: string;
  customer_id_ext: string;
  name: string;
  doc: string;
  email: string | null;
  phone: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
}

interface Specifier {
  id: string;
  specifier_id_ext: string;
  name: string;
  doc: string;
  email: string | null;
  phone: string | null;
  status: string;
  role: string;
  user_id: string | null;
  created_at: string;
}

type EditData = {
  name: string;
  email: string;
  phone: string;
};

const AdminGerenciarCadastros = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [linkedFilter, setLinkedFilter] = useState<string>("all");
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    type: "customer" | "specifier" | null;
    id: string | null;
    data: EditData;
  }>({
    open: false,
    type: null,
    id: null,
    data: { name: "", email: "", phone: "" },
  });

  const { data: customers, isLoading: loadingCustomers } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Customer[];
    },
  });

  const { data: specifiers, isLoading: loadingSpecifiers } = useQuery({
    queryKey: ["admin-specifiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specifiers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Specifier[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ type, id, data }: { type: "customer" | "specifier"; id: string; data: EditData }) => {
      const table = type === "customer" ? "customers" : "specifiers";
      const { error } = await supabase
        .from(table)
        .update({
          name: data.name.trim(),
          email: data.email.trim() || null,
          phone: data.phone.trim() || null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: variables.type === "customer" ? ["admin-customers"] : ["admin-specifiers"] });
      toast.success("Cadastro atualizado com sucesso!");
      setEditDialog({ open: false, type: null, id: null, data: { name: "", email: "", phone: "" } });
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const handleEdit = (type: "customer" | "specifier", item: Customer | Specifier) => {
    setEditDialog({
      open: true,
      type,
      id: item.id,
      data: {
        name: item.name,
        email: item.email || "",
        phone: item.phone || "",
      },
    });
  };

  const handleSave = () => {
    if (!editDialog.type || !editDialog.id) return;
    
    if (!editDialog.data.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    updateMutation.mutate({
      type: editDialog.type,
      id: editDialog.id,
      data: editDialog.data,
    });
  };

  const formatDoc = (doc: string) => {
    const cleaned = doc.replace(/\D/g, "");
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    } else if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return doc;
  };

  const filterItems = <T extends Customer | Specifier>(items: T[] | undefined): T[] => {
    if (!items) return [];
    
    return items.filter(item => {
      // Filtro de busca por texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().replace(/\D/g, "") || searchTerm.toLowerCase();
        const matchesSearch = 
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.doc.replace(/\D/g, "").includes(term) ||
          (item.email && item.email.toLowerCase().includes(searchTerm.toLowerCase()));
        if (!matchesSearch) return false;
      }

      // Filtro de status
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      // Filtro de vinculado
      if (linkedFilter === "yes" && !item.user_id) return false;
      if (linkedFilter === "no" && item.user_id) return false;

      return true;
    });
  };

  const filteredCustomers = filterItems(customers);
  const filteredSpecifiers = filterItems(specifiers);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gerenciar Cadastros</h1>
        <p className="text-muted-foreground mt-2">
          Editar dados de clientes e especificadores
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CPF/CNPJ ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="inactive">Inativo</SelectItem>
          </SelectContent>
        </Select>

        <Select value={linkedFilter} onValueChange={setLinkedFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Vinculado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Vinculado</SelectItem>
            <SelectItem value="no">Não Vinculado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="customers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="customers">Clientes ({filteredCustomers.length})</TabsTrigger>
          <TabsTrigger value="specifiers">Especificadores ({filteredSpecifiers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Clientes Cadastrados</CardTitle>
              <CardDescription>
                {searchTerm ? `${filteredCustomers.length} de ${customers?.length || 0}` : `${customers?.length || 0}`} clientes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCustomers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Ext</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vinculado</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-mono text-sm">{customer.customer_id_ext}</TableCell>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell className="font-mono text-sm">{formatDoc(customer.doc)}</TableCell>
                          <TableCell>{customer.email || "-"}</TableCell>
                          <TableCell>{customer.phone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                              {customer.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={customer.user_id ? "default" : "outline"}>
                              {customer.user_id ? "Sim" : "Não"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit("customer", customer)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specifiers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Especificadores Cadastrados</CardTitle>
              <CardDescription>
                {searchTerm ? `${filteredSpecifiers.length} de ${specifiers?.length || 0}` : `${specifiers?.length || 0}`} especificadores
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSpecifiers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID Ext</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF/CNPJ</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Vinculado</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSpecifiers.map((specifier) => (
                        <TableRow key={specifier.id}>
                          <TableCell className="font-mono text-sm">{specifier.specifier_id_ext}</TableCell>
                          <TableCell className="font-medium">{specifier.name}</TableCell>
                          <TableCell className="font-mono text-sm">{formatDoc(specifier.doc)}</TableCell>
                          <TableCell>{specifier.email || "-"}</TableCell>
                          <TableCell>{specifier.phone || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{specifier.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={specifier.status === "active" ? "default" : "secondary"}>
                              {specifier.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={specifier.user_id ? "default" : "outline"}>
                              {specifier.user_id ? "Sim" : "Não"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit("specifier", specifier)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editDialog.open} onOpenChange={(open) => !updateMutation.isPending && setEditDialog({ ...editDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cadastro</DialogTitle>
            <DialogDescription>
              Atualize os dados de contato do {editDialog.type === "customer" ? "cliente" : "especificador"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={editDialog.data.name}
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  data: { ...editDialog.data, name: e.target.value }
                })}
                placeholder="Nome completo"
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editDialog.data.email}
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  data: { ...editDialog.data, email: e.target.value }
                })}
                placeholder="email@exemplo.com"
                disabled={updateMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={editDialog.data.phone}
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  data: { ...editDialog.data, phone: e.target.value }
                })}
                placeholder="(11) 99999-9999"
                disabled={updateMutation.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog({ open: false, type: null, id: null, data: { name: "", email: "", phone: "" } })}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminGerenciarCadastros;
