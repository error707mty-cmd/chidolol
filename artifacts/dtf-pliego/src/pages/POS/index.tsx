import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { 
  ShoppingCart, Users, Package, History, Settings,
  BarChart3, LogOut, Home, DollarSign, FileText
} from "lucide-react";
import SaleTab from "./tabs/SaleTab";
import CustomersTab from "./tabs/CustomersTab";
import InventoryTab from "./tabs/InventoryTab";
import HistoryTab from "./tabs/HistoryTab";
import PricingTab from "./tabs/PricingTab";
import SettingsTab from "./tabs/SettingsTab";
import DashboardTab from "./tabs/DashboardTab";
import CashRegisterTab from "./tabs/CashRegisterTab";

type TabType = "dashboard" | "sale" | "customers" | "inventory" | "history" | "pricing" | "settings" | "cash";

export default function POSPage() {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("sale");

  const tabs = [
    { id: "sale", label: "Vender", icon: ShoppingCart, color: "from-orange-500 to-pink-600" },
    { id: "cash", label: "Caja", icon: DollarSign, color: "from-green-500 to-emerald-600" },
    { id: "customers", label: "Clientes", icon: Users, color: "from-blue-500 to-cyan-600" },
    { id: "inventory", label: "Inventario", icon: Package, color: "from-purple-500 to-violet-600" },
    { id: "pricing", label: "Precios", icon: FileText, color: "from-yellow-500 to-amber-600" },
    { id: "history", label: "Ventas", icon: History, color: "from-indigo-500 to-blue-600" },
    { id: "dashboard", label: "Dashboard", icon: BarChart3, color: "from-pink-500 to-rose-600" },
    { id: "settings", label: "Config", icon: Settings, color: "from-gray-500 to-slate-600" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 shadow-xl">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors">
                <Home className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">Pliegos</span>
              </button>
            </Link>
            <div className="h-6 w-px bg-gray-700"></div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
              Sistema POS
            </h1>
          </div>
          
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors border border-red-800/50"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Salir</span>
          </button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <nav className="bg-gray-900/50 border-b border-gray-800 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto px-6">
          <div className="flex gap-2 overflow-x-auto py-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
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
                      ? `bg-gradient-to-r ${tab.color} text-white shadow-lg shadow-${tab.color.split('-')[1]}-500/20` 
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
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
        {activeTab === "cash" && <CashRegisterTab />}
        {activeTab === "customers" && <CustomersTab />}
        {activeTab === "inventory" && <InventoryTab />}
        {activeTab === "pricing" && <PricingTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "settings" && <SettingsTab />}
      </main>
    </div>
  );
}
