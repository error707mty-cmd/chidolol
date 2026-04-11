import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Receipt, Calendar } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const API_BASE = "/api";

interface Sale {
  id: number;
  folio: string;
  customerName: string;
  totalMeters: string;
  pricePerMeter: string;
  total: string;
  paymentMethod: string;
  createdAt: string;
}

export default function HistoryTab() {
  const { token } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/pos/sales?limit=100`, { headers });
      const data = await res.json();
      setSales(data.sales || []);
    } catch (err) {
      console.error("Error fetching sales:", err);
    } finally {
      setLoading(false);
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
      <h2 className="text-2xl font-bold text-gray-900">Historial de Ventas</h2>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Folio</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Cliente</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Metros</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Total</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Pago</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <span className="font-mono text-sm font-medium text-purple-600">
                    {sale.folio}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium text-gray-900">
                  {sale.customerName}
                </td>
                <td className="px-6 py-4 text-gray-600">
                  {Number(sale.totalMeters).toFixed(2)} m
                </td>
                <td className="px-6 py-4 font-bold text-green-600">
                  ${Number(sale.total).toFixed(2)}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-700 capitalize">
                    {sale.paymentMethod}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {format(new Date(sale.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sales.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay ventas registradas</p>
          </div>
        )}
      </div>
    </div>
  );
}
