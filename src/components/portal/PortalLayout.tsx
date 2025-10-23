import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { PortalSidebar } from "./PortalSidebar";
import logoFlex from "@/assets/logo-flex.png";

interface PortalLayoutProps {
  children: React.ReactNode;
}

export const PortalLayout = ({ children }: PortalLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <PortalSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b flex items-center px-4 bg-card gap-3">
            <SidebarTrigger />
            <img src={logoFlex} alt="FLEX Clube" className="h-8 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-primary">FLEX Clube</h1>
              <p className="text-xs text-muted-foreground">Bem-vindo</p>
            </div>
          </header>
          <main className="flex-1 p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
