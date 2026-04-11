import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Package, AlertTriangle, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

interface InventoryItem {
  id: number;
  productName: string;
  description?: string;
  imageUrl?: string;
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    productName: "",
    description: "",
    imageUrl: "",
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
        imageUrl: "",
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('image', file);

      const res = await fetch(`${API_BASE}/admin/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formDataUpload,
      });

      if (!res.ok) throw new Error('Error al subir imagen');
      const data = await res.json();
      setFormData({ ...formData, imageUrl: data.imageUrl });
      toast.success('Imagen subida correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al subir imagen');
    } finally {
      setUploadingImage(false);
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
    <div className="space-y-4 h-[calc(100vh-12rem)] overflow-y-auto pr-2">
      <div className="flex justify-between items-center">
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all transform hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Nuevo Producto
        </button>
      </div>

      {showForm && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-violet-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Image Upload */}
              <div>
                {formData.imageUrl && (
                  <img src={formData.imageUrl} alt="Preview" className="w-20 h-20 rounded-lg object-cover mb-2 border border-gray-700" />
                )}
                <label className="cursor-pointer">
                  <div className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs font-medium transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingImage ? 'Subiendo...' : 'Subir Imagen'}
                  </div>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={uploadingImage} />
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  placeholder="Nombre del producto *" required
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
                />
                <input type="number" step="0.01" value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Stock inicial"
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
                />
                <select value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="metros">Metros</option>
                  <option value="piezas">Piezas</option>
                  <option value="rollos">Rollos</option>
                  <option value="litros">Litros</option>
                  <option value="kilos">Kilos</option>
                </select>
                <input type="number" step="0.01" value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  placeholder="Costo unitario"
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
                />
                <input type="number" step="0.01" value={formData.lowStockAlert}
                  onChange={(e) => setFormData({ ...formData, lowStockAlert: e.target.value })}
                  placeholder="Alerta de stock bajo"
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
                />
              </div>
              <textarea value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción" rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all"
                >
                  Crear Producto
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => {
          const isLowStock = item.lowStockAlert && Number(item.stock) <= Number(item.lowStockAlert);
          
          return (
            <div key={item.id}
              className="group relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-105"
            >
              <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-gray-900">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 text-gray-600" />
                  </div>
                )}
              </div>
              <h3 className="font-bold text-white text-xs mb-1 line-clamp-1">{item.productName}</h3>
              {item.description && (
                <p className="text-[10px] text-gray-400 mb-1 line-clamp-1">{item.description}</p>
              )}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-400">Stock:</span>
                  <span className={`font-bold ${isLowStock ? 'text-red-400' : 'text-white'}`}>
                    {Number(item.stock).toFixed(1)} {item.unit}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-400">Costo:</span>
                  <span className="font-bold text-green-400">${Number(item.cost).toFixed(0)}</span>
                </div>
                {isLowStock && (
                  <div className="flex items-center gap-1 text-red-400 text-[10px] p-1 bg-red-500/10 rounded border border-red-500/30">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Bajo</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 mx-auto mb-2 text-gray-600" />
          <p className="text-gray-400 text-sm">No hay productos en el inventario</p>
        </div>
      )}
    </div>
  );
}
