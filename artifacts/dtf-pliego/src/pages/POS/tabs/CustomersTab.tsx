import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Edit, Trash2, Search, User } from "lucide-react";
import { toast } from "sonner";

const API_BASE = "/api";

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  priceType: string;
  customPricePerMeter?: string;
  notes?: string;
}

export default function CustomersTab() {
  const { token } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    priceType: "normal",
    customPricePerMeter: "",
    notes: "",
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      console.log('Fetching customers with token:', token?.substring(0, 20));
      const res = await fetch(`${API_BASE}/admin/pos/customers`, { headers });
      console.log('Response status:', res.status);
      if (!res.ok) {
        const errorData = await res.text();
        console.error('Error response:', errorData);
        throw new Error('Error al cargar clientes');
      }
      const data = await res.json();
      console.log('Clientes recibidos:', data);
      setCustomers(data.customers || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Error al cargar clientes. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const url = editingCustomer
        ? `${API_BASE}/admin/pos/customers/${editingCustomer.id}`
        : `${API_BASE}/admin/pos/customers`;
      
      const method = editingCustomer ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Error al guardar');
      
      await fetchCustomers();
      setShowForm(false);
      setEditingCustomer(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        priceType: "normal",
        customPricePerMeter: "",
        notes: "",
      });
      toast.success(editingCustomer ? "Cliente actualizado" : "Cliente creado");
    } catch (err) {
      console.error("Error saving customer:", err);
      toast.error("Error al guardar cliente");
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      email: customer.email || "",
      phone: customer.phone || "",
      priceType: customer.priceType,
      customPricePerMeter: customer.customPricePerMeter || "",
      notes: customer.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;

    try {
      const res = await fetch(`${API_BASE}/admin/pos/customers/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error('Error al eliminar');
      await fetchCustomers();
      toast.success("Cliente eliminado");
    } catch (err) {
      console.error("Error deleting customer:", err);
      toast.error("Error al eliminar cliente");
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-12rem)] overflow-y-auto pr-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button onClick={() => {
            setShowForm(true);
            setEditingCustomer(null);
            setFormData({
              name: "",
              email: "",
              phone: "",
              priceType: "normal",
              customPricePerMeter: "",
              notes: "",
            });
          }}
          className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all transform hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          Nuevo Cliente
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
            <h3 className="text-sm font-bold text-white mb-3">
              {editingCustomer ? "Editar Cliente" : "Nuevo Cliente"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre *" required
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                />
                <input type="email" value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Email"
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                />
                <input type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Teléfono"
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                />
                <select value={formData.priceType}
                  onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
                  className="px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="revendedor">Revendedor</option>
                  <option value="especial">Especial</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>
              {formData.priceType === "custom" && (
                <input type="number" step="0.01" value={formData.customPricePerMeter}
                  onChange={(e) => setFormData({ ...formData, customPricePerMeter: e.target.value })}
                  placeholder="Precio personalizado por metro"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                />
              )}
              <textarea value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas" rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all"
                >
                  {editingCustomer ? "Actualizar" : "Crear"}
                </button>
                <button type="button" onClick={() => {
                    setShowForm(false);
                    setEditingCustomer(null);
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl opacity-20 blur-sm"></div>
        <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-900/90 border-b border-gray-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Nombre</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Contacto</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Tipo</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-300">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold text-xs">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white text-xs">{customer.name}</p>
                          {customer.notes && (
                            <p className="text-[10px] text-gray-400 truncate max-w-[120px]">{customer.notes}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-xs text-gray-300">{customer.email || "-"}</p>
                      <p className="text-xs text-gray-400">{customer.phone || "-"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 capitalize">
                        {customer.priceType}
                      </span>
                      {customer.customPricePerMeter && (
                        <p className="text-xs text-gray-400 mt-0.5">${customer.customPricePerMeter}/m</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleEdit(customer)}
                          className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(customer.id)}
                          className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCustomers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No se encontraron clientes</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
