import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

const AdminRelatorios = () => {
  const handleExport = (type: string) => {
    toast.info(`Exportação de ${type} em desenvolvimento`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Relatórios</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Extrato Geral de Pontos</CardTitle>
            <CardDescription>
              Exportar todas as transações do ledger
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("ledger")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ranking de Clientes</CardTitle>
            <CardDescription>
              Top clientes por pontos acumulados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("ranking-clientes")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ranking de Especificadores</CardTitle>
            <CardDescription>
              Top especificadores por pontos acumulados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("ranking-especificadores")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relatório de Resgates</CardTitle>
            <CardDescription>
              Histórico completo de resgates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("resgates")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relatório de Faturas</CardTitle>
            <CardDescription>
              Histórico completo de faturas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("faturas")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estoque de Produtos</CardTitle>
            <CardDescription>
              Situação atual do estoque
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => handleExport("estoque")} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminRelatorios;
