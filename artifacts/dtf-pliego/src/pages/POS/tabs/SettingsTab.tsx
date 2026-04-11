import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

interface BusinessConfig {
  businessName: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  rfc?: string;
  ticketHeader?: string;
  ticketFooter?: string;
  logoUrl?: string;
}

export default function SettingsTab() {
  const { token } = useAuth();
  const [config, setConfig] = useState<BusinessConfig>({
    businessName: "DTF Pliego",
    ticketHeader: "¡Gracias por tu compra!",
    ticketFooter: "Conserva tu ticket para cualquier aclaración",
  });
  const [loading, setLoading] = useState(true);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/pos/config`, { headers });
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Error fetching config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch(`${API_BASE}/admin/pos/config`, {
        method: "PUT",
        headers,
        body: JSON.stringify(config),
      });

      if (res.ok) {
        toast.success("Configuración guardada correctamente");
      } else {
        toast.error("Error al guardar la configuración");
      }
    } catch (err) {
      console.error("Error saving config:", err);
      toast.error("Error al guardar la configuración");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <SettingsIcon className="w-7 h-7 text-yellow-500" />
        Configuración del Negocio
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business Info */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Información del Negocio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Negocio</label>
              <input
                type="text"
                value={config.businessName}
                onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">RFC</label>
              <input
                type="text"
                value={config.rfc || ""}
                onChange={(e) => setConfig({ ...config, rfc: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Teléfono</label>
              <input
                type="tel"
                value={config.phone || ""}
                onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={config.email || ""}
                onChange={(e) => setConfig({ ...config, email: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Dirección</label>
              <input
                type="text"
                value={config.address || ""}
                onChange={(e) => setConfig({ ...config, address: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Sitio Web</label>
              <input
                type="url"
                value={config.website || ""}
                onChange={(e) => setConfig({ ...config, website: e.target.value })}
                placeholder="https://"
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Ticket Configuration */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Configuración de Tickets</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Encabezado del Ticket</label>
              <input
                type="text"
                value={config.ticketHeader || ""}
                onChange={(e) => setConfig({ ...config, ticketHeader: e.target.value })}
                placeholder="Texto que aparecerá al inicio del ticket"
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pie del Ticket</label>
              <input
                type="text"
                value={config.ticketFooter || ""}
                onChange={(e) => setConfig({ ...config, ticketFooter: e.target.value })}
                placeholder="Texto que aparecerá al final del ticket"
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">URL del Logo (opcional)</label>
              <input
                type="url"
                value={config.logoUrl || ""}
                onChange={(e) => setConfig({ ...config, logoUrl: e.target.value })}
                placeholder="https://ejemplo.com/logo.png"
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-yellow-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-yellow-400 to-amber-500 text-white rounded-lg font-bold text-lg hover:shadow-lg transition-all"
        >
          <Save className="w-6 h-6" />
          Guardar Configuración
        </button>
      </form>
    </div>
  );
}
