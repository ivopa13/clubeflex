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
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
