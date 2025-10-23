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
import { Plus, Pencil, Upload, X } from "lucide-react";

const AdminProdutos = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
      let imageUrl = editingProduct?.image_urls?.[0] || null;

      // Upload da imagem se houver
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const product = {
        sku: formData.get("sku") as string,
        name: formData.get("name") as string,
        description: formData.get("description") as string,
        points_price: parseFloat(formData.get("points_price") as string),
        stock_qty: parseInt(formData.get("stock_qty") as string),
        track_inventory: formData.get("track_inventory") === "true",
        category: formData.get("category") as string,
        is_active: formData.get("is_active") === "true",
        image_urls: imageUrl ? [imageUrl] : null,
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
      setImageFile(null);
      setImagePreview(null);
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
    setImageFile(null);
    setImagePreview(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (product: any) => {
    setEditingProduct(product);
    setImageFile(null);
    setImagePreview(product.image_urls?.[0] || null);
    setIsDialogOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
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
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              <DialogHeader>
                <DialogTitle>{editingProduct ? "Editar" : "Novo"} Produto</DialogTitle>
                <DialogDescription>
                  Preencha as informações do produto
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4 overflow-y-auto flex-1">
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
                <div className="space-y-2">
                  <Label htmlFor="image">Imagem do Produto</Label>
                  {imagePreview ? (
                    <div className="relative">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-full h-48 object-cover rounded-md"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={removeImage}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-muted-foreground/25 rounded-md p-8 text-center hover:border-muted-foreground/50 transition-colors">
                      <Input
                        id="image"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                      <Label htmlFor="image" className="cursor-pointer">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Clique para fazer upload da imagem
                        </p>
                      </Label>
                    </div>
                  )}
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
                      id="track_inventory_switch"
                      defaultChecked={editingProduct?.track_inventory ?? true}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("track_inventory") as HTMLInputElement;
                        input.value = checked.toString();
                      }}
                    />
                    <input 
                      type="hidden" 
                      id="track_inventory" 
                      name="track_inventory" 
                      defaultValue={(editingProduct?.track_inventory ?? true).toString()} 
                    />
                    <Label htmlFor="track_inventory_switch">Controlar Estoque</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active_switch"
                      defaultChecked={editingProduct?.is_active ?? true}
                      onCheckedChange={(checked) => {
                        const input = document.getElementById("is_active") as HTMLInputElement;
                        input.value = checked.toString();
                      }}
                    />
                    <input 
                      type="hidden" 
                      id="is_active" 
                      name="is_active" 
                      defaultValue={(editingProduct?.is_active ?? true).toString()} 
                    />
                    <Label htmlFor="is_active_switch">Ativo</Label>
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
                  <TableHead>Foto</TableHead>
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
                    <TableCell>
                      {product.image_urls?.[0] ? (
                        <img 
                          src={product.image_urls[0]} 
                          alt={product.name}
                          className="h-12 w-12 object-cover rounded"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground">
                          Sem foto
                        </div>
                      )}
                    </TableCell>
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
