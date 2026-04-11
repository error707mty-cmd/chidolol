import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

interface InventoryItem {
  id: number;
  productName: string;
  description?: string;
  stock: string;
  unit: string;
  cost: string;
  lowStockAlert?: string;
}

export default function InventoryTab() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    productName: "",
    description: "",
    stock: "",
    unit: "metros",
    cost: "",
    lowStockAlert: "",
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      setLoading(true);
      console.log('Fetching inventory...');
      const res = await fetch(`${API_BASE}/admin/pos/inventory`, { headers });
      console.log('Inventory response status:', res.status);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      console.log('Inventory data:', data);
      setItems(data.items || []);
    } catch (err) {
      console.error("Error fetching inventory:", err);
      toast.error("Error al cargar inventario");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetch(`${API_BASE}/admin/pos/inventory`, {
        method: "POST",
        headers,
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Error');
      await fetchInventory();
      setShowForm(false);
      setFormData({
        productName: "",
        description: "",
        stock: "",
        unit: "metros",
        cost: "",
        lowStockAlert: "",
      });
      toast.success("Producto agregado");
    } catch (err) {
      console.error("Error creating product:", err);
      toast.error("Error al crear producto");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Inventario</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                placeholder="Nombre del producto *"
                required
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="Stock inicial"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="metros">Metros</option>
                <option value="piezas">Piezas</option>
                <option value="rollos">Rollos</option>
                <option value="litros">Litros</option>
                <option value="kilos">Kilos</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="Costo unitario"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.lowStockAlert}
                onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })}
                placeholder="Alerta de stock bajo"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Crear Producto
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
        {items.map((item) => {
          const isLowStock = item.lowStockAlert && Number(item.stock) <= Number(item.lowStockAlert);
          
          return (
            <div
              key={item.id}
              className="bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-purple-500/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-purple-500 to-violet-600 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{item.productName}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-400">{item.description}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Stock:</span>
                  <span className={`font-bold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                    {Number(item.stock).toFixed(2)} {item.unit}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Costo:</span>
                  <span className="font-bold text-green-400">${Number(item.cost).toFixed(2)}</span>
                </div>
                {isLowStock && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mt-2 p-2 bg-red-500/10 rounded-lg border border-red-500/30">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Stock bajo</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">No hay productos en el inventario</p>
          <p className="text-sm text-gray-500 mt-2">Agrega tu primer producto usando el botón de arriba</p>
        </div>
      )}
    </div>
  );
}
