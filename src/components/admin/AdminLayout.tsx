import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout = ({ children }: AdminLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 border-b flex items-center px-4 bg-card">
            <SidebarTrigger />
            <div className="ml-4">
              <h1 className="text-xl font-bold text-primary">Flex Fidelidade</h1>
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
