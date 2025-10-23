import { Home, Receipt, ShoppingBag, Package, FileText, LogOut } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const items = [
  { title: "Início", url: "/portal", icon: Home },
  { title: "Extrato", url: "/portal/extrato", icon: FileText },
  { title: "Faturas", url: "/portal/faturas", icon: Receipt },
  { title: "Vitrine", url: "/portal/vitrine", icon: ShoppingBag },
  { title: "Meus Resgates", url: "/portal/resgates", icon: Package },
];

export function PortalSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso!");
    navigate("/auth");
  };

  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-white/20 text-white font-medium" : "text-white/80 hover:bg-white/10 hover:text-white";

  return (
    <Sidebar className={`bg-primary ${state === "collapsed" ? "w-14" : "w-60"}`}>
      <SidebarContent className="bg-primary">
        <SidebarGroup>
          <SidebarGroupLabel className={`text-white ${state === "collapsed" ? "text-center" : ""}`}>
            {state !== "collapsed" && "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end className={getNavCls}>
                      <item.icon className={state === "collapsed" ? "" : "mr-2"} />
                      {state !== "collapsed" && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="bg-primary">
        <Button
          variant="ghost"
          className="w-full justify-start text-white hover:bg-white/20"
          onClick={handleLogout}
        >
          <LogOut className={state === "collapsed" ? "" : "mr-2"} />
          {state !== "collapsed" && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
