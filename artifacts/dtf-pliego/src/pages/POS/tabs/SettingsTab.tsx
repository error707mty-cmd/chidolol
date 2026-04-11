import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Save, Settings as SettingsIcon, Upload, Image } from "lucide-react";
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
  const [uploadingLogo, setUploadingLogo] = useState(false);

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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch(`${API_BASE}/admin/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Error al subir imagen');
      const data = await res.json();
      setConfig({ ...config, logoUrl: data.imageUrl });
      toast.success('Logo subido correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al subir logo');
    } finally {
      setUploadingLogo(false);
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
    <div className="space-y-4 h-[calc(100vh-12rem)] overflow-y-auto pr-2">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Logo Upload */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-bold text-white">Logo del Negocio</h3>
            </div>
            <div className="flex items-center gap-3">
              {config.logoUrl && (
                <img src={config.logoUrl} alt="Logo" className="w-16 h-16 rounded-lg object-contain bg-gray-900 border border-gray-700 p-1" />
              )}
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
                </div>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
              </label>
            </div>
          </div>
        </div>

        {/* Business Info */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-blue-400" />
              Información del Negocio
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input type="text" value={config.businessName}
                onChange={(e) => setConfig({ ...config, businessName: e.target.value })}
                placeholder="Nombre del Negocio"
                className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input type="text" value={config.rfc || ""}
                onChange={(e) => setConfig({ ...config, rfc: e.target.value })}
                placeholder="RFC"
                className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input type="tel" value={config.phone || ""}
                onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                placeholder="Teléfono"
                className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input type="email" value={config.email || ""}
                onChange={(e) => setConfig({ ...config, email: e.target.value })}
                placeholder="Email"
                className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input type="text" value={config.address || ""}
                onChange={(e) => setConfig({ ...config, address: e.target.value })}
                placeholder="Dirección"
                className="md:col-span-2 px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
              <input type="url" value={config.website || ""}
                onChange={(e) => setConfig({ ...config, website: e.target.value })}
                placeholder="Sitio Web"
                className="md:col-span-2 px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Ticket Configuration */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-violet-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Save className="w-4 h-4 text-purple-400" />
              Configuración de Tickets
            </h3>
            <div className="space-y-3">
              <input type="text" value={config.ticketHeader || ""}
                onChange={(e) => setConfig({ ...config, ticketHeader: e.target.value })}
                placeholder="Encabezado del Ticket"
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none transition-colors"
              />
              <input type="text" value={config.ticketFooter || ""}
                onChange={(e) => setConfig({ ...config, ticketFooter: e.target.value })}
                placeholder="Pie del Ticket"
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none transition-colors"
              />
            </div>
          </div>
        </div>

        <button type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-lg font-bold text-sm hover:shadow-lg transition-all transform hover:scale-105"
        >
          <Save className="w-4 h-4" />
          Guardar Configuración
        </button>
      </form>
    </div>
  );
}
