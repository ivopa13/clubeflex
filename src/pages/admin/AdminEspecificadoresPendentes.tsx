import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserX } from "lucide-react";

const AdminEspecificadoresPendentes = () => {
  const { data: pendingSpecifiers, isLoading } = useQuery({
    queryKey: ["admin-pending-specifiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specifiers")
        .select("*")
        .is("user_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <UserX className="h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="text-3xl font-bold">Especificadores Pendentes</h1>
          <p className="text-muted-foreground">
            Especificadores que receberam pontos mas ainda não se cadastraram
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Especificadores Sem Cadastro</CardTitle>
          <CardDescription>
            {pendingSpecifiers?.length || 0} especificadores aguardando cadastro no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : pendingSpecifiers && pendingSpecifiers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Códigos ERP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSpecifiers.map((specifier) => (
                  <TableRow key={specifier.id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{specifier.name}</span>
                        {Array.isArray(specifier.external_ids) && specifier.external_ids.length > 1 && (
                          <div className="text-xs text-muted-foreground">
                            {specifier.external_ids.length} registros no ERP
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{specifier.doc}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{specifier.role}</Badge>
                    </TableCell>
                    <TableCell>{specifier.email || "-"}</TableCell>
                    <TableCell>{specifier.phone || "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(specifier.external_ids) && specifier.external_ids.map((ext: any, idx) => (
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
              <p>Todos os especificadores estão cadastrados no sistema</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminEspecificadoresPendentes;
