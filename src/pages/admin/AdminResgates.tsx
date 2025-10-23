import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, X, Package } from "lucide-react";

const AdminResgates = () => {
  const queryClient = useQueryClient();

  const { data: redemptions, isLoading } = useQuery({
    queryKey: ["admin-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("redemptions")
        .select(`
          *,
          actor_id_customer:customers(name),
          actor_id_specifier:specifiers(name),
          redemption_items(
            qty,
            points_price,
            product:catalog_products(name)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "requested" | "approved" | "rejected" | "fulfilled" | "canceled" }) => {
      const { error } = await supabase
        .from("redemptions")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-redemptions"] });
      toast.success("Status atualizado!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar status");
    },
  });

  const statusMap = {
    requested: { label: "Solicitado", variant: "secondary" as const },
    approved: { label: "Aprovado", variant: "default" as const },
    rejected: { label: "Rejeitado", variant: "destructive" as const },
    fulfilled: { label: "Entregue", variant: "default" as const },
    canceled: { label: "Cancelado", variant: "outline" as const },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Gerenciar Resgates</h1>

      <Card>
        <CardHeader>
          <CardTitle>Todos os Resgates</CardTitle>
          <CardDescription>Aprovar, rejeitar ou marcar como entregue</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pontos</TableHead>
                  <TableHead>Itens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {redemptions?.map((redemption: any) => {
                  const userName = redemption.actor_type === "customer"
                    ? redemption.actor_id_customer?.name
                    : redemption.actor_id_specifier?.name;
                  const status = statusMap[redemption.status as keyof typeof statusMap];
                  
                  return (
                    <TableRow key={redemption.id}>
                      <TableCell className="font-medium">{userName || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {redemption.actor_type === "customer" ? "Cliente" : "Especificador"}
                        </Badge>
                      </TableCell>
                      <TableCell>{Number(redemption.total_points).toFixed(2)}</TableCell>
                      <TableCell className="text-xs">
                        {redemption.redemption_items?.map((item: any, idx: number) => (
                          <div key={idx}>
                            {item.qty}x {item.product?.name}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(redemption.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {redemption.status === "requested" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateStatusMutation.mutate({ id: redemption.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateStatusMutation.mutate({ id: redemption.id, status: "rejected" })}
                              >
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                          {redemption.status === "approved" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: redemption.id, status: "fulfilled" })}
                            >
                              <Package className="h-4 w-4 text-blue-600" />
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
    </div>
  );
};

export default AdminResgates;
