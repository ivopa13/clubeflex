import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Settings, Coins } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export default function AdminConfiguracoes() {
  const queryClient = useQueryClient();
  const [pointValue, setPointValue] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["program-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (settings) {
      setPointValue(String((settings as any).point_monetary_value ?? "0.02"));
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (value: number) => {
      if (!settings?.id) throw new Error("Settings not found");
      const { error } = await supabase
        .from("program_settings")
        .update({ point_monetary_value: value } as any)
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Valor do ponto atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["program-settings"] });
    },
    onError: () => {
      toast.error("Erro ao atualizar valor do ponto.");
    },
  });

  const handleSave = () => {
    const value = parseFloat(pointValue.replace(",", "."));
    if (isNaN(value) || value <= 0) {
      toast.error("Informe um valor válido maior que zero.");
      return;
    }
    mutation.mutate(value);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie as configurações do programa de fidelidade
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Valor do Ponto
          </CardTitle>
          <CardDescription>
            Defina quanto vale cada ponto em reais (R$). Esse valor é usado para calcular o poder de compra dos pontos acumulados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1 max-w-xs">
              <Label htmlFor="pointValue">Valor em R$ por ponto</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input
                  id="pointValue"
                  type="text"
                  value={pointValue}
                  onChange={(e) => setPointValue(e.target.value)}
                  className="pl-10"
                  placeholder="0.02"
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
            <p><strong>Exemplo:</strong> Com valor de R$ {pointValue || "0.02"} por ponto:</p>
            <p>• 100 pontos = R$ {(parseFloat((pointValue || "0").replace(",", ".")) * 100 || 0).toFixed(2)}</p>
            <p>• 500 pontos = R$ {(parseFloat((pointValue || "0").replace(",", ".")) * 500 || 0).toFixed(2)}</p>
            <p>• 1.000 pontos = R$ {(parseFloat((pointValue || "0").replace(",", ".")) * 1000 || 0).toFixed(2)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
