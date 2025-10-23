import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import logoFlex from "@/assets/logo-flex.png";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b flex items-center px-4 bg-card gap-3">
            <SidebarTrigger />
            <img src={logoFlex} alt="FLEX Clube" className="h-8 object-contain" />
            <div>
              <h1 className="text-xl font-bold text-primary">FLEX Clube</h1>
              <p className="text-xs text-muted-foreground">Administrador</p>
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
