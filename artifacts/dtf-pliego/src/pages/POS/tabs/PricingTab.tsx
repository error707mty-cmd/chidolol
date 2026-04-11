import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, DollarSign, Edit } from "lucide-react";

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
      const res = await fetch(`${API_BASE}/admin/pos/price-tiers`, { headers });
      const data = await res.json();
      setTiers(data.tiers || []);
    } catch (err) {
      console.error("Error fetching price tiers:", err);
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

      if (res.ok) {
        fetchTiers();
        setShowForm(false);
        setFormData({
          name: "",
          minMeters: "",
          maxMeters: "",
          pricePerMeter: "",
        });
      }
    } catch (err) {
      console.error("Error creating price tier:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Escalas de Precios</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nueva Escala
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre (ej: normal, revendedor) *"
                required
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-green-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.minMeters}
                onChange={(e) => setFormData({ ...formData, minMeters: e.target.value })}
                placeholder="Metros mínimos *"
                required
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-green-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.maxMeters}
                onChange={(e) => setFormData({ ...formData, maxMeters: e.target.value })}
                placeholder="Metros máximos (opcional)"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-green-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.pricePerMeter}
                onChange={(e) => setFormData({ ...formData, pricePerMeter: e.target.value })}
                placeholder="Precio por metro *"
                required
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-green-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Crear Escala
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
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
            className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 capitalize">{tier.name}</h3>
                <p className="text-sm text-gray-500">
                  {Number(tier.minMeters).toFixed(2)}m {tier.maxMeters ? `- ${Number(tier.maxMeters).toFixed(2)}m` : '+'}
                </p>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-green-600">
                ${Number(tier.pricePerMeter).toFixed(2)}
              </span>
              <span className="text-gray-500">/metro</span>
            </div>
          </div>
        ))}
      </div>

      {tiers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No hay escalas de precios configuradas</p>
        </div>
      )}
    </div>
  );
}
