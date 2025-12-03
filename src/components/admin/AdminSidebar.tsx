import { Home, Package, ShoppingBag, FileText, BarChart3, Users, LogOut, Database, AlertTriangle, DollarSign, UserX, User, UserCog, TrendingUp } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const menuItems = [
  { title: "Dashboard", icon: Home, path: "/admin" },
  { title: "Vendas", icon: TrendingUp, path: "/admin/vendas" },
  { title: "Perfil", icon: User, path: "/admin/perfil" },
  { title: "Usuários", icon: Users, path: "/admin/usuarios" },
  { title: "Gerenciar Cadastros", icon: UserCog, path: "/admin/gerenciar-cadastros" },
  { title: "Especificadores Pendentes", icon: UserX, path: "/admin/especificadores-pendentes" },
  { title: "Catálogo", icon: Package, path: "/admin/produtos" },
  { title: "Resgates", icon: ShoppingBag, path: "/admin/resgates" },
  { title: "Faturas", icon: FileText, path: "/admin/faturas" },
  { title: "Pagamentos", icon: DollarSign, path: "/admin/pagamentos" },
  { title: "Relatórios", icon: BarChart3, path: "/admin/relatorios" },
  { title: "Logs Integração", icon: Database, path: "/admin/logs" },
  { title: "Erros de Validação", icon: AlertTriangle, path: "/admin/erros-validacao" },
];

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair");
    } else {
      toast.success("Logout realizado");
      navigate("/");
    }
  };

  return (
    <Sidebar style={{ backgroundColor: "#18375d" }}>
      <SidebarContent style={{ backgroundColor: "#18375d" }}>
        <SidebarGroup>
          <SidebarGroupLabel className="text-white">Menu do Administrador</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.path)}
                    isActive={location.pathname === item.path}
                    className={location.pathname === item.path 
                      ? "bg-white/20 text-white font-medium" 
                      : "text-white/80 hover:bg-white/10 hover:text-white"}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter style={{ backgroundColor: "#18375d" }}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              className="text-white hover:bg-white/20"
            >
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
