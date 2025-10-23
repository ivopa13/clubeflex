import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

const AdminProdutos = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const product = {
        sku: formData.get("sku") as string,
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        points_price: parseFloat(formData.get("points_price") as string),
        stock_qty: parseInt(formData.get("stock_qty") as string),
        track_inventory: formData.get("track_inventory") === "true",
        category: formData.get("category") as string,
        is_active: formData.get("is_active") === "true",
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("catalog_products")
          .update(product)
          .eq("id", editingProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("catalog_products")
          .insert(product);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(editingProduct ? "Produto atualizado!" : "Produto criado!");
      setIsDialogOpen(false);
      setEditingProduct(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar produto");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    saveMutation.mutate(formData);
  };

  const openNewDialog = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Catálogo de Produtos</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Editar" : "Novo"} Produto</DialogTitle>
                <DialogDescription>
                  Preencha as informações do produto
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">SKU *</Label>
                    <Input id="sku" name="sku" defaultValue={editingProduct?.sku} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome *</Label>
                    <Input id="name" name="name" defaultValue={editingProduct?.name} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" defaultValue={editingProduct?.description} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="points_price">Preço em Pontos *</Label>
                    <Input
                      id="points_price"
                      name="points_price"
                      type="number"
                      step="0.01"
                      defaultValue={editingProduct?.points_price}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stock_qty">Estoque</Label>
                    <Input
                      id="stock_qty"
                      name="stock_qty"
                      type="number"
                      defaultValue={editingProduct?.stock_qty || 0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Input id="category" name="category" defaultValue={editingProduct?.category} />
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="track_inventory"
                      name="track_inventory"
                      defaultChecked={editingProduct?.track_inventory ?? true}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("track_inventory") as HTMLInputElement;
                        input.value = checked.toString();
                      }}
                    />
                    <Label htmlFor="track_inventory">Controlar Estoque</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      name="is_active"
                      defaultChecked={editingProduct?.is_active ?? true}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("is_active") as HTMLInputElement;
                        input.value = checked.toString();
                      }}
                    />
                    <Label htmlFor="is_active">Ativo</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>Gerenciar produtos da vitrine</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Pontos</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{Number(product.points_price).toFixed(2)}</TableCell>
                    <TableCell>{product.track_inventory ? product.stock_qty : "N/A"}</TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={product.is_active ? "default" : "secondary"}>
                        {product.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(product)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProdutos;
