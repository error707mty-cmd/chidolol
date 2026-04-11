import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Plus, Edit, Trash2, Search, User } from "lucide-react";

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
      const res = await fetch(`${API_BASE}/admin/pos/customers`, { headers });
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
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

      if (res.ok) {
        fetchCustomers();
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
      }
    } catch (err) {
      console.error("Error saving customer:", err);
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
      await fetch(`${API_BASE}/admin/pos/customers/${id}`, {
        method: "DELETE",
        headers,
      });
      fetchCustomers();
    } catch (err) {
      console.error("Error deleting customer:", err);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
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
          className="ml-4 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-400 to-indigo-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          Nuevo Cliente
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
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
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Email"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Teléfono"
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              />
              <select
                value={formData.priceType}
                onChange={(e) => setFormData({ ...formData, priceType: e.target.value })}
                className="px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
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
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
              />
            )}
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Notas"
              rows={3}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-400 to-indigo-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                {editingCustomer ? "Actualizar" : "Crear"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingCustomer(null);
                }}
                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Nombre</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Contacto</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Tipo de Precio</th>
              <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredCustomers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{customer.name}</p>
                      {customer.notes && (
                        <p className="text-sm text-gray-500 truncate max-w-xs">{customer.notes}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-900">{customer.email || "-"}</p>
                  <p className="text-sm text-gray-500">{customer.phone || "-"}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 capitalize">
                    {customer.priceType}
                  </span>
                  {customer.customPricePerMeter && (
                    <p className="text-sm text-gray-500 mt-1">${customer.customPricePerMeter}/m</p>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEdit(customer)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(customer.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
  );
}
