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
  { title: "Início", url: "/customer", icon: Home },
  { title: "Extrato", url: "/customer/extrato", icon: FileText },
  { title: "Faturas", url: "/customer/faturas", icon: Receipt },
  { title: "Vitrine", url: "/customer/vitrine", icon: ShoppingBag },
  { title: "Meus Resgates", url: "/customer/resgates", icon: Package },
];

export function CustomerSidebar() {
  const { state } = useSidebar();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logout realizado com sucesso!");
    navigate("/auth");
  };

  const getNavCls = ({ isActive }: { isActive: boolean }) =>
    isActive ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted/50";

  return (
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className={state === "collapsed" ? "text-center" : ""}>
            {state !== "collapsed" && "Portal do Cliente"}
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
      <SidebarFooter>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={handleLogout}
        >
          <LogOut className={state === "collapsed" ? "" : "mr-2"} />
          {state !== "collapsed" && "Sair"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
