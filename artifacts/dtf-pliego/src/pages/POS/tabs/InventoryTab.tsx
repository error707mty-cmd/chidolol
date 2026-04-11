import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Edit, Package, AlertTriangle } from "lucide-react";

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
      const res = await fetch(`${API_BASE}/admin/pos/inventory`, { headers });
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      console.error("Error fetching inventory:", err);
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

      if (res.ok) {
        fetchInventory();
        setShowForm(false);
        setFormData({
          productName: "",
          description: "",
          stock: "",
          unit: "metros",
          cost: "",
          lowStockAlert: "",
        });
      }
    } catch (err) {
      console.error("Error creating product:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Inventario</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.productName}
                onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                placeholder="Nombre del producto *"
                required
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="Stock inicial"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
              />
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
              >
                <option value="metros">Metros</option>
                <option value="piezas">Piezas</option>
                <option value="rollos">Rollos</option>
                <option value="litros">Litros</option>
              </select>
              <input
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="Costo unitario"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={formData.lowStockAlert}
                onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })}
                placeholder="Alerta de stock bajo"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
              />
            </div>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descripción"
              rows={3}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-pink-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                Crear Producto
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
        {items.map((item) => {
          const isLowStock = item.lowStockAlert && Number(item.stock) <= Number(item.lowStockAlert);
          
          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-pink-500 to-rose-500 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">{item.productName}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-500">{item.description}</p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Stock:</span>
                  <span className={`font-bold ${isLowStock ? 'text-red-600' : 'text-gray-900'}`}>
                    {Number(item.stock).toFixed(2)} {item.unit}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Costo:</span>
                  <span className="font-bold text-gray-900">${Number(item.cost).toFixed(2)}</span>
                </div>
                {isLowStock && (
                  <div className="flex items-center gap-2 text-red-600 text-sm mt-2 p-2 bg-red-50 rounded-lg">
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
        <div className="text-center py-12 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No hay productos en el inventario</p>
        </div>
      )}
    </div>
  );
}
