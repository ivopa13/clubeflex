import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getUserActorInfo } from "@/lib/userRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, User } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(3, "Nome deve ter no mínimo 3 caracteres").max(100, "Nome muito longo"),
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  phone: z.string().max(20, "Telefone muito longo").optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface ProfileData {
  name: string;
  email: string | null;
  phone: string | null;
  doc: string;
  created_at: string;
  actorType: "customer" | "specifier";
  actorIdExt: string;
}

export default function PortalPerfil() {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: profileData, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile"],
    queryFn: async () => {
      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) {
        throw new Error("Usuário não identificado");
      }

      if (actorType === "customer") {
        const { data, error } = await supabase
          .from("customers")
          .select("name, email, phone, doc, created_at, customer_id_ext")
          .eq("id", actorId)
          .single();

        if (error) throw error;
        return {
          ...data,
          actorType,
          actorIdExt: data.customer_id_ext,
        };
      } else {
        const { data, error } = await supabase
          .from("specifiers")
          .select("name, email, phone, doc, created_at, specifier_id_ext")
          .eq("id", actorId)
          .single();

        if (error) throw error;
        return {
          ...data,
          actorType,
          actorIdExt: data.specifier_id_ext,
        };
      }
    },
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
    },
  });

  useEffect(() => {
    if (profileData) {
      form.reset({
        name: profileData.name,
        email: profileData.email || "",
        phone: profileData.phone || "",
      });
    }
  }, [profileData, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const { actorType, actorId } = await getUserActorInfo();
      if (!actorType || !actorId) {
        throw new Error("Usuário não identificado");
      }

      const updateData = {
        name: data.name.trim(),
        email: data.email.trim(),
        phone: data.phone?.trim() || null,
      };

      const table = actorType === "customer" ? "customers" : "specifiers";
      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq("id", actorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Cadastro atualizado com sucesso!");
      setIsSubmitting(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro ao atualizar cadastro: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    setIsSubmitting(true);
    updateMutation.mutate(data);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Não foi possível carregar seus dados.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground mt-2">
          Mantenha seus dados atualizados, parceiro!
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações do Cadastro
          </CardTitle>
          <CardDescription>
            Dados que não podem ser alterados pelo sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                CPF/CNPJ
              </label>
              <p className="text-foreground font-medium mt-1">
                {formatDoc(profileData.doc)}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                ID de Cadastro
              </label>
              <p className="text-foreground font-medium mt-1">
                {profileData.actorIdExt}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Tipo de Conta
              </label>
              <p className="text-foreground font-medium mt-1">
                {profileData.actorType === "customer" ? "Cliente" : "Especificador"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Cadastrado em
              </label>
              <p className="text-foreground font-medium mt-1">
                {new Date(profileData.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados Editáveis</CardTitle>
          <CardDescription>
            Atualize suas informações de contato
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Seu nome completo"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="seu@email.com"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="(11) 99999-9999"
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
