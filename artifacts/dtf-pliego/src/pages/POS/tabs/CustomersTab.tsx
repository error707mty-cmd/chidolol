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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-gray-800 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => {
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
          className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingCustomer ? "Editar Cliente" : "Nuevo Cliente"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nombre *"
                required
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Teléfono"
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
              <select
                value={formData.priceType}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
                className="px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="revendedor">Revendedor</option>
                <option value="especial">Especial</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            {formData.priceType === "custom" && (
              <input
                type="number"
                step="0.01"
                value={formData.customPricePerMeter}
                onChange={(e) => setFormData({ ...formData, customPricePerMeter: e.target.value })}
                placeholder="Precio personalizado por metro"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
            )}
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                {editingCustomer ? "Actualizar" : "Crear"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingCustomer(null);
                }}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Nombre</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Contacto</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Tipo de Precio</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-300">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-600 flex items-center justify-center text-white font-bold">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">{customer.name}</p>
                        {customer.notes && (
                          <p className="text-sm text-gray-400 truncate max-w-xs">{customer.notes}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-300">{customer.email || "-"}</p>
                    <p className="text-sm text-gray-400">{customer.phone || "-"}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-300 capitalize">
                      {customer.priceType}
                    </span>
                    {customer.customPricePerMeter && (
                      <p className="text-sm text-gray-400 mt-1">${customer.customPricePerMeter}/m</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(customer)}
                        className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(customer.id)}
                        className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
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
              <p>No se encontraron clientes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
