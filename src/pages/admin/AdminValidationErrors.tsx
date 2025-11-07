import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, XCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ValidationError {
  id: string;
  event_id: string;
  event_type: string;
  error_type: string;
  entity_type: string;
  received_data: any;
  error_details: string;
  status: "pending" | "resolved" | "ignored";
  created_at: string;
  resolved_at?: string;
}

export default function AdminValidationErrors() {
  const queryClient = useQueryClient();
  const [selectedError, setSelectedError] = useState<ValidationError | null>(null);

  const { data: errors = [], isLoading } = useQuery({
    queryKey: ["validation-errors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("validation_errors")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ValidationError[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "resolved" | "ignored" }) => {
      const { error } = await supabase
        .from("validation_errors")
        .update({
          status,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["validation-errors"] });
      toast.success("Status atualizado com sucesso");
      setSelectedError(null);
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar: ${error.message}`);
    },
  });

  const pendingErrors = errors.filter((e) => e.status === "pending");
  const resolvedErrors = errors.filter((e) => e.status === "resolved");
  const ignoredErrors = errors.filter((e) => e.status === "ignored");

  const getErrorTypeBadge = (errorType: string) => {
    switch (errorType) {
      case "invalid_cpf_cnpj":
        return <Badge variant="destructive">CPF/CNPJ Inválido</Badge>;
      case "empty_name":
        return <Badge variant="destructive">Nome Vazio</Badge>;
      default:
        return <Badge variant="secondary">{errorType}</Badge>;
    }
  };

  const getEntityTypeBadge = (entityType: string) => {
    return entityType === "customer" ? (
      <Badge variant="outline">Cliente</Badge>
    ) : (
      <Badge variant="outline">Especificador</Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            Pendente
          </Badge>
        );
      case "resolved":
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle2 className="h-3 w-3" />
            Resolvido
          </Badge>
        );
      case "ignored":
        return (
          <Badge variant="secondary" className="gap-1">
            <XCircle className="h-3 w-3" />
            Ignorado
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Erros de Validação</h1>
        <p className="text-muted-foreground">
          Gerencie erros de validação detectados durante a sincronização
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingErrors.length}</div>
            <p className="text-xs text-muted-foreground">Aguardando resolução</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolvidos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{resolvedErrors.length}</div>
            <p className="text-xs text-muted-foreground">Corrigidos no CPLus</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ignorados</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ignoredErrors.length}</div>
            <p className="text-xs text-muted-foreground">Marcados para ignorar</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Erros Pendentes */}
      {pendingErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Erros Pendentes</CardTitle>
            <CardDescription>
              Erros que precisam de atenção. Corrija no CPLus e marque como resolvido.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingErrors.map((error) => (
                <div
                  key={error.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getErrorTypeBadge(error.error_type)}
                      {getEntityTypeBadge(error.entity_type)}
                      {getStatusBadge(error.status)}
                    </div>
                    <p className="text-sm font-medium">{error.error_details}</p>
                    <p className="text-xs text-muted-foreground">
                      ID do Evento: {error.event_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(error.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedError(error)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Erros Resolvidos/Ignorados */}
      {(resolvedErrors.length > 0 || ignoredErrors.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>Erros já processados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...resolvedErrors, ...ignoredErrors].map((error) => (
                <div
                  key={error.id}
                  className="flex items-center justify-between p-4 border rounded-lg opacity-60"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      {getErrorTypeBadge(error.error_type)}
                      {getEntityTypeBadge(error.entity_type)}
                      {getStatusBadge(error.status)}
                    </div>
                    <p className="text-sm">{error.error_details}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(error.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedError(error)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de Detalhes */}
      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Erro</DialogTitle>
            <DialogDescription>
              Informações completas sobre o erro de validação
            </DialogDescription>
          </DialogHeader>

          {selectedError && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {getErrorTypeBadge(selectedError.error_type)}
                {getEntityTypeBadge(selectedError.entity_type)}
                {getStatusBadge(selectedError.status)}
              </div>

              <div>
                <h4 className="font-semibold mb-2">Descrição do Erro</h4>
                <p className="text-sm">{selectedError.error_details}</p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">ID do Evento</h4>
                <p className="text-sm font-mono bg-muted p-2 rounded">
                  {selectedError.event_id}
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Dados Recebidos</h4>
                <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                  {JSON.stringify(selectedError.received_data, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Data de Criação</h4>
                <p className="text-sm">
                  {format(new Date(selectedError.created_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                    locale: ptBR,
                  })}
                </p>
              </div>

              {selectedError.status === "pending" && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedError.id,
                        status: "resolved",
                      })
                    }
                    disabled={updateStatusMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Resolvido
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedError.id,
                        status: "ignored",
                      })
                    }
                    disabled={updateStatusMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Ignorar
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
