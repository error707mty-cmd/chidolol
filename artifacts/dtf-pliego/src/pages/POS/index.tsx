import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { 
  ShoppingCart, Users, Package, History, Settings,
  BarChart3, LogOut, Home
} from "lucide-react";
import SaleTab from "./tabs/SaleTab";
import CustomersTab from "./tabs/CustomersTab";
import InventoryTab from "./tabs/InventoryTab";
import HistoryTab from "./tabs/HistoryTab";
import PricingTab from "./tabs/PricingTab";
import SettingsTab from "./tabs/SettingsTab";
import DashboardTab from "./tabs/DashboardTab";

type TabType = "dashboard" | "sale" | "customers" | "inventory" | "history" | "pricing" | "settings";

export default function POSPage() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("sale");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: "from-blue-500 to-cyan-500" },
    { id: "sale", label: "Nueva Venta", icon: ShoppingCart, color: "from-orange-500 to-pink-500" },
    { id: "customers", label: "Clientes", icon: Users, color: "from-blue-400 to-indigo-500" },
    { id: "inventory", label: "Inventario", icon: Package, color: "from-pink-500 to-rose-500" },
    { id: "pricing", label: "Precios", icon: Settings, color: "from-green-400 to-emerald-500" },
    { id: "history", label: "Historial", icon: History, color: "from-purple-500 to-violet-500" },
    { id: "settings", label: "Configuración", icon: Settings, color: "from-yellow-400 to-amber-500" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Home className="w-5 h-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Volver a Pliegos</span>
              </button>
            </Link>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">
              Sistema POS
            </h1>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Cerrar Sesión</span>
          </button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-[1800px] mx-auto px-6">
          <div className="flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap
                    ${isActive 
                      ? `bg-gradient-to-r ${tab.color} text-white shadow-md scale-105` 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-6">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "sale" && <SaleTab />}
        {activeTab === "customers" && <CustomersTab />}
        {activeTab === "inventory" && <InventoryTab />}
        {activeTab === "pricing" && <PricingTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
