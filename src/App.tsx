import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AuthGuard } from "./components/auth/AuthGuard";
import { CustomerLayout } from "./components/customer/CustomerLayout";
import CustomerHome from "./pages/customer/CustomerHome";
import CustomerExtrato from "./pages/customer/CustomerExtrato";
import CustomerFaturas from "./pages/customer/CustomerFaturas";
import CustomerVitrine from "./pages/customer/CustomerVitrine";
import CustomerCheckout from "./pages/customer/CustomerCheckout";
import CustomerResgates from "./pages/customer/CustomerResgates";
import { AdminLayout } from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProdutos from "./pages/admin/AdminProdutos";
import AdminResgates from "./pages/admin/AdminResgates";
import AdminFaturas from "./pages/admin/AdminFaturas";
import AdminRelatorios from "./pages/admin/AdminRelatorios";

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
          
          {/* Customer Routes */}
          <Route
            path="/customer"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerHome />
                </CustomerLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/customer/extrato"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerExtrato />
                </CustomerLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/customer/faturas"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerFaturas />
                </CustomerLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/customer/vitrine"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerVitrine />
                </CustomerLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/customer/checkout"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerCheckout />
                </CustomerLayout>
              </AuthGuard>
            }
          />
          <Route
            path="/customer/resgates"
            element={
              <AuthGuard allowedRoles={["customer"]}>
                <CustomerLayout>
                  <CustomerResgates />
                </CustomerLayout>
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
            path="/admin/relatorios"
            element={
              <AuthGuard allowedRoles={["admin"]}>
                <AdminLayout>
                  <AdminRelatorios />
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
