import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AuthGuard } from "./components/auth/AuthGuard";
import { PortalLayout } from "./components/portal/PortalLayout";
import PortalHome from "./pages/portal/PortalHome";
import PortalExtrato from "./pages/portal/PortalExtrato";
import PortalFaturas from "./pages/portal/PortalFaturas";
import PortalVitrine from "./pages/portal/PortalVitrine";
import PortalCheckout from "./pages/portal/PortalCheckout";
import PortalResgates from "./pages/portal/PortalResgates";
import PortalPerfil from "./pages/portal/PortalPerfil";
import { AdminLayout } from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsuarios from "./pages/admin/AdminUsuarios";
import AdminProdutos from "./pages/admin/AdminProdutos";
import AdminResgates from "./pages/admin/AdminResgates";
import AdminFaturas from "./pages/admin/AdminFaturas";
import AdminRelatorios from "./pages/admin/AdminRelatorios";
import AdminSyncLogs from "./pages/admin/AdminSyncLogs";
import AdminValidationErrors from "./pages/admin/AdminValidationErrors";
import AdminPagamentos from "./pages/admin/AdminPagamentos";
import AdminClientesPendentes from "./pages/admin/AdminClientesPendentes";
import AdminEspecificadoresPendentes from "./pages/admin/AdminEspecificadoresPendentes";
import AdminPerfil from "./pages/admin/AdminPerfil";
import AdminGerenciarCadastros from "./pages/admin/AdminGerenciarCadastros";
import AdminVendas from "./pages/admin/AdminVendas";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          
          {/* Portal Routes (Customer & Specifier) */}
          <Route
            path="/portal"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalHome />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/extrato"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalExtrato />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/faturas"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalFaturas />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/vitrine"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalVitrine />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/checkout"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalCheckout />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/resgates"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalResgates />
                </PortalLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/portal/perfil"
            element={
              <AuthGuard allowedRoles={["customer", "specifier"]}>
                <PortalLayout>
                  <PortalPerfil />
                </PortalLayout>
              </AuthGuard>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/vendas"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminVendas />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminUsuarios />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/gerenciar-cadastros"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminGerenciarCadastros />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/produtos"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminProdutos />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/resgates"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminResgates />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/faturas"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminFaturas />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/pagamentos"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminPagamentos />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/relatorios"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminRelatorios />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminSyncLogs />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/erros-validacao"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminValidationErrors />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/clientes-pendentes"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminClientesPendentes />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/especificadores-pendentes"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminEspecificadoresPendentes />
                </AdminLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/admin/perfil"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminPerfil />
                </AdminLayout>
              </AuthGuard>
            }
          />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
