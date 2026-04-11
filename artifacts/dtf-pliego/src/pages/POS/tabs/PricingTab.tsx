import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, DollarSign } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

interface PriceTier {
  id: number;
  name: string;
  minMeters: string;
  maxMeters: string | null;
  pricePerMeter: string;
  isActive: boolean;
}

export default function PricingTab() {
  const { token } = useAuth();
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    minMeters: "",
    maxMeters: "",
    pricePerMeter: "",
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchTiers();
  }, []);

  const fetchTiers = async () => {
    try {
      setLoading(true);
      console.log('Fetching price tiers...');
      const res = await fetch(`${API_BASE}/admin/pos/price-tiers`, { headers });
      console.log('Price tiers response status:', res.status);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      console.log('Price tiers data:', data);
      setTiers(data.tiers || []);
    } catch (err) {
      console.error("Error fetching price tiers:", err);
      toast.error("Error al cargar precios");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch(`${API_BASE}/admin/pos/price-tiers`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...formData,
          maxMeters: formData.maxMeters || null,
        }),
      });

      if (!res.ok) throw new Error('Error');
      await fetchTiers();
      setShowForm(false);
      setFormData({
        name: "",
        minMeters: "",
        maxMeters: "",
        pricePerMeter: "",
      });
      toast.success("Escala de precio creada");
    } catch (err) {
      console.error("Error creating price tier:", err);
      toast.error("Error al crear escala de precio");
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Escalas de Precios</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nueva Escala
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre (ej: normal, revendedor) *"
                required
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-yellow-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.minMeters}
                onChange={(e) => setFormData({ ...formData, minMeters: e.target.value })}
                placeholder="Metros mínimos *"
                required
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-yellow-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.maxMeters}
                onChange={(e) => setFormData({ ...formData, maxMeters: e.target.value })}
                placeholder="Metros máximos (opcional)"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-yellow-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.pricePerMeter}
                onChange={(e) => setFormData({ ...formData, pricePerMeter: e.target.value })}
                placeholder="Precio por metro *"
                required
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-yellow-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-yellow-500 to-amber-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Crear Escala
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-yellow-500/50 transition-all"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-600 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white capitalize">{tier.name}</h3>
                <p className="text-sm text-gray-400">
                  {Number(tier.minMeters).toFixed(2)}m {tier.maxMeters ? `- ${Number(tier.maxMeters).toFixed(2)}m` : '+'}
                </p>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-yellow-400">
                ${Number(tier.pricePerMeter).toFixed(2)}
              </span>
              <span className="text-gray-400">/metro</span>
            </div>
          </div>
        ))}
      </div>

      {tiers.length === 0 && (
        <div className="text-center py-12">
          <DollarSign className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">No hay escalas de precios configuradas</p>
          <p className="text-sm text-gray-500 mt-2">Agrega escalas de precio para calcular automáticamente</p>
        </div>
      )}
    </div>
  );
}
