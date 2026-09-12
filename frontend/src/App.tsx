// frontend/src/App.tsx
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { token } from "@/api";
import { DashboardProvider } from "@/dashboard/DashboardContext";
import { SidebarContent } from "@/components/Sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Resumo } from "@/views/sections/Resumo";
import { Patrimonio } from "@/views/sections/Patrimonio";
import { Investimentos } from "@/views/sections/Investimentos";
import { Cartoes } from "@/views/sections/Cartoes";
import { Gastos } from "@/views/sections/Gastos";
import { Transacoes } from "@/views/sections/Transacoes";

function App() {
  const navigate = useNavigate();

  const logout = () => {
    token.clear();
    navigate("/login", { replace: true });
  };

  return (
    <DashboardProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Barra superior — só mobile; a navegação principal é a bottom bar. */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/50 bg-card px-4 py-3 md:hidden">
          <h1 className="text-lg font-semibold">fin-dash</h1>
        </header>

        {/* Sidebar desktop. */}
        <aside className="hidden shrink-0 border-border/50 bg-card p-4 md:flex md:w-60 md:flex-col md:border-r">
          <h1 className="mb-6 px-2 text-lg font-semibold">fin-dash</h1>
          <SidebarContent onLogout={logout} />
        </aside>

        {/* pb-20 no mobile: espaço pra bottom bar não cobrir o conteúdo. */}
        <main className="min-w-0 flex-1 p-4 pb-20 md:p-8 md:pb-8">
          <GlobalHeader />
          {/* Rotas DESCENDENTES (App é montado em path="/*"): caminhos relativos,
              sem "/" inicial, senão o React Router 7 lança erro. Os to= de NavLink/
              Navigate continuam absolutos ("/resumo"). */}
          <Routes>
            <Route path="resumo" element={<Resumo />} />
            <Route path="patrimonio" element={<Patrimonio />} />
            <Route path="investimentos" element={<Investimentos />} />
            <Route path="cartoes" element={<Cartoes />} />
            <Route path="gastos" element={<Gastos />} />
            <Route path="transacoes" element={<Transacoes />} />
            <Route path="*" element={<Navigate to="/resumo" replace />} />
          </Routes>
        </main>

        <BottomTabBar onLogout={logout} />
      </div>
    </DashboardProvider>
  );
}

export default App;
