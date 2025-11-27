import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUpDown, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const AdminFaturas = () => {
  const [ascending, setAscending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["admin-invoices", ascending],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customer:customers(name),
          specifier:specifiers(name)
        `)
        .order("invoice_id_ext", { ascending });

      if (error) throw error;
      return data;
    },
  });

  const filteredInvoices = useMemo(() => {
    if (!invoices || !searchTerm.trim()) return invoices;
    
    const term = searchTerm.toLowerCase().trim();
    return invoices.filter((invoice: any) => 
      invoice.invoice_id_ext?.toLowerCase().includes(term) ||
      invoice.order_number?.toLowerCase().includes(term) ||
      invoice.customer?.name?.toLowerCase().includes(term) ||
      invoice.specifier?.name?.toLowerCase().includes(term)
    );
  }, [invoices, searchTerm]);

  const getStatusLabel = (status: string, releasedCustomer: number, releasedSpecifier: number) => {
    const totalReleased = Number(releasedCustomer) + Number(releasedSpecifier);
    if (totalReleased > 0) {
      return { label: "Disponível", variant: "default" as const, className: "bg-green-500 text-white hover:bg-green-600" };
    }
    return { label: "Pendente", variant: "secondary" as const, className: "" };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Faturas</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAscending(!ascending)}
          className="gap-2"
        >
          <ArrowUpDown className="h-4 w-4" />
          {ascending ? "Crescente" : "Decrescente"}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código, pedido, cliente ou especificador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Faturas</CardTitle>
          <CardDescription>Visualização de todas as faturas do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nº Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Especificador</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Total de Pontos</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices?.map((invoice: any) => {
                  const status = getStatusLabel(
                    invoice.status,
                    invoice.released_points_customer,
                    invoice.released_points_specifier
                  );
                  
                  const totalPoints = Number(invoice.pending_points_customer) + 
                                     Number(invoice.released_points_customer) + 
                                     Number(invoice.pending_points_specifier) + 
                                     Number(invoice.released_points_specifier);
                  
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">{invoice.invoice_id_ext}</TableCell>
                      <TableCell className="font-mono text-sm">{invoice.order_number || "-"}</TableCell>
                      <TableCell className="font-medium">{invoice.customer?.name || "N/A"}</TableCell>
                      <TableCell>{invoice.specifier?.name || "-"}</TableCell>
                      <TableCell>R$ {Number(invoice.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="font-bold">
                        {totalPoints.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} pontos
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className={status.className}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(invoice.created_at), "dd/MM/yy", { locale: ptBR })}
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

export default AdminFaturas;
