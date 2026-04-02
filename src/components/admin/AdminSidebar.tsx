import { Home, Package, ShoppingBag, FileText, BarChart3, Users, LogOut, Database, AlertTriangle, DollarSign, User, UserCog, TrendingUp, Settings, ChevronDown } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import logoGrupoFlex from "@/assets/logo-grupo-flex.png";

const menuItems = [
  { title: "Dashboard", icon: Home, path: "/admin" },
  { title: "Vendas", icon: TrendingUp, path: "/admin/vendas" },
  { title: "Perfil", icon: User, path: "/admin/perfil" },
  { title: "Usuários", icon: Users, path: "/admin/usuarios" },
  { title: "Gerenciar Cadastros", icon: UserCog, path: "/admin/gerenciar-cadastros" },
  { title: "Catálogo", icon: Package, path: "/admin/produtos" },
  { title: "Resgates", icon: ShoppingBag, path: "/admin/resgates" },
  { title: "Faturas", icon: FileText, path: "/admin/faturas" },
  { title: "Pagamentos", icon: DollarSign, path: "/admin/pagamentos" },
  { title: "Relatórios", icon: BarChart3, path: "/admin/relatorios" },
];

const settingsSubItems = [
  { title: "Geral", icon: Settings, path: "/admin/configuracoes" },
  { title: "Logs Integração", icon: Database, path: "/admin/logs" },
  { title: "Erros de Validação", icon: AlertTriangle, path: "/admin/erros-validacao" },
];

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsActive = settingsSubItems.some(item => location.pathname === item.path);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

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
        <div className="bg-white p-[50px] flex items-center justify-center">
          <img src={logoGrupoFlex} alt="Grupo Flex" className="w-full h-auto object-contain" />
        </div>
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

              {/* Configurações - Collapsible */}
              <SidebarMenuItem>
                <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={isSettingsActive
                        ? "bg-white/20 text-white font-medium"
                        : "text-white/80 hover:bg-white/10 hover:text-white"}
                    >
                      <Settings className="h-4 w-4" />
                      <span>Configurações</span>
                      <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenu className="pl-4 mt-1">
                      {settingsSubItems.map((item) => (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            onClick={() => navigate(item.path)}
                            isActive={location.pathname === item.path}
                            className={location.pathname === item.path
                              ? "bg-white/20 text-white font-medium"
                              : "text-white/60 hover:bg-white/10 hover:text-white"}
                          >
                            <item.icon className="h-3.5 w-3.5" />
                            <span className="text-sm">{item.title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
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
