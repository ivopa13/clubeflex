import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PortalSidebar } from "./PortalSidebar";
import logoFlex from "@/assets/logo-flex.png";
import { supabase } from "@/integrations/supabase/client";
import { getUserActorInfo } from "@/lib/userRole";

interface PortalLayoutProps {
  children: React.ReactNode;
}

export const PortalLayout = ({ children }: PortalLayoutProps) => {
  const [userName, setUserName] = useState<string>("");

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
            .single();
          if (data) setUserName(data.name);
        } else if (actorType === "specifier") {
          const { data } = await supabase
            .from("specifiers")
            .select("name")
            .eq("id", actorId)
            .single();
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
          <header className="h-16 border-b flex items-center px-4 bg-card gap-3">
            <SidebarTrigger />
            <div>
              <h1 className="text-xl font-bold text-primary">FLEX Clube</h1>
              <p className="text-xs text-muted-foreground">
                {userName ? `Bem-vindo, ${userName}` : "Bem-vindo"}
              </p>
            </div>
            <img src={logoFlex} alt="FLEX Clube" className="h-12 object-contain ml-auto" />
          </header>
          <main className="flex-1 p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
