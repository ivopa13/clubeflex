import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PortalSidebar } from "./PortalSidebar";
import logoFlex from "@/assets/logo-flex.png";
import { supabase } from "@/integrations/supabase/client";
import { getUserActorInfo } from "@/lib/userRole";
import { usePortalBalance } from "@/hooks/usePortalBalance";
import { Coins } from "lucide-react";

interface PortalLayoutProps {
  children: React.ReactNode;
}

export const PortalLayout = ({ children }: PortalLayoutProps) => {
  const [userName, setUserName] = useState<string>("");
  const { data: balance } = usePortalBalance();

  useEffect(() => {
    const fetchUserName = async () => {
      try {
        const { actorType, actorId } = await getUserActorInfo();
        if (!actorType || !actorId) return;

        if (actorType === "customer") {
          const { data } = await supabase
            .from("customers")
            .select("name")
            .eq("id", actorId)
            .maybeSingle();
          if (data) setUserName(data.name);
        } else if (actorType === "specifier") {
          const { data } = await supabase
            .from("specifiers")
            .select("name")
            .eq("id", actorId)
            .maybeSingle();
          if (data) setUserName(data.name);
        }
      } catch (error) {
        console.error("Error fetching user name:", error);
      }
    };

    fetchUserName();
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PortalSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b flex items-center px-4 bg-card gap-4">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold text-primary">FLEX Clube</h1>
                <p className="text-xs text-muted-foreground">Portal de Pontos</p>
              </div>
              {userName && (
                <div className="px-4 py-1.5 rounded-lg bg-secondary border border-border">
                  <p className="text-sm font-semibold text-foreground">{userName}</p>
                </div>
              )}
            </div>
            {balance && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
                <Coins className="h-5 w-5 text-primary" />
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Pontos Disponíveis</p>
                  <p className="text-lg font-bold text-primary">
                    {balance.redeemable.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
            <img src={logoFlex} alt="FLEX Clube" className="h-12 object-contain" />
          </header>
          <main className="flex-1 p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
