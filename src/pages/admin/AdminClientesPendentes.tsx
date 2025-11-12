import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserX } from "lucide-react";

const AdminClientesPendentes = () => {
  const { data: pendingCustomers, isLoading } = useQuery({
    queryKey: ["admin-pending-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .is("user_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const getTotalPoints = (customerId: string) => {
    // This would require a separate query or join with points_ledger
    return 0; // Placeholder
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserX className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Clientes Pendentes</h1>
          <p className="text-muted-foreground">
            Clientes que receberam pontos mas ainda não se cadastraram
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes Sem Cadastro</CardTitle>
          <CardDescription>
            {pendingCustomers?.length || 0} clientes aguardando cadastro no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : pendingCustomers && pendingCustomers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Códigos ERP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingCustomers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{customer.name}</span>
                        {Array.isArray(customer.external_ids) && customer.external_ids.length > 1 && (
                          <div className="text-xs text-muted-foreground">
                            {customer.external_ids.length} registros no ERP
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{customer.doc}</TableCell>
                    <TableCell>{customer.email || "-"}</TableCell>
                    <TableCell>{customer.phone || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(customer.external_ids) && customer.external_ids.map((ext: any, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {ext.id_ext}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        Aguardando Cadastro
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <UserX className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Todos os clientes estão cadastrados no sistema</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminClientesPendentes;
