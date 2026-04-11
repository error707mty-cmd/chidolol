import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Receipt, Calendar, Filter, TrendingUp, DollarSign } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
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

type FilterType = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

export default function HistoryTab() {
  const { token } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

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
      const res = await fetch(`${API_BASE}/admin/pos/sales?limit=1000`, { headers });
      const data = await res.json();
      setSales(data.sales || []);
    } catch (err) {
      console.error("Error fetching sales:", err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSales = () => {
    const now = new Date();
    
    switch(filterType) {
      case 'today':
        return sales.filter(s => {
          const saleDate = new Date(s.createdAt);
          return saleDate >= startOfDay(now) && saleDate <= endOfDay(now);
        });
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return sales.filter(s => new Date(s.createdAt) >= weekAgo);
      case 'month':
        return sales.filter(s => {
          const saleDate = new Date(s.createdAt);
          return saleDate >= startOfMonth(now) && saleDate <= endOfMonth(now);
        });
      case 'year':
        return sales.filter(s => {
          const saleDate = new Date(s.createdAt);
          return saleDate >= startOfYear(now) && saleDate <= endOfYear(now);
        });
      case 'custom':
        if (!customStart || !customEnd) return sales;
        return sales.filter(s => {
          const saleDate = new Date(s.createdAt);
          return saleDate >= new Date(customStart) && saleDate <= new Date(customEnd);
        });
      default:
        return sales;
    }
  };

  const filteredSales = getFilteredSales();
  const totalRevenue = filteredSales.reduce((sum, s) => sum + Number(s.total), 0);
  const totalMeters = filteredSales.reduce((sum, s) => sum + Number(s.totalMeters), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-12rem)] overflow-y-auto pr-2">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-green-400" />
              <p className="text-xs text-gray-400">Ingresos</p>
            </div>
            <p className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <p className="text-xs text-gray-400">Ventas</p>
            </div>
            <p className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">
              {filteredSales.length}
            </p>
          </div>
        </div>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-violet-500 rounded-xl opacity-20 blur-sm"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-purple-400" />
              <p className="text-xs text-gray-400">Metros</p>
            </div>
            <p className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-violet-500 bg-clip-text text-transparent">
              {totalMeters.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl opacity-20 blur-sm"></div>
        <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-orange-400" />
            <h3 className="text-sm font-bold text-white">Filtros</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'today', 'week', 'month', 'year', 'custom'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 ${
                  filterType === f
                    ? 'bg-gradient-to-r from-orange-500 to-pink-600 text-white shadow-lg'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {f === 'all' ? 'Todas' : f === 'today' ? 'Hoy' : f === 'week' ? 'Semana' : f === 'month' ? 'Mes' : f === 'year' ? 'Año' : 'Personalizado'}
              </button>
            ))}
          </div>
          {filterType === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1.5 text-xs rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-orange-500 focus:outline-none"
              />
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-xs rounded-lg bg-gray-900 border border-gray-700 text-white focus:border-orange-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-violet-500 rounded-xl opacity-20 blur-sm"></div>
        <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-900/90 border-b border-gray-700 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Folio</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Cliente</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Metros</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Pago</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs font-medium text-indigo-400">
                        {sale.folio}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-white text-xs">
                      {sale.customerName}
                    </td>
                    <td className="px-3 py-2 text-gray-300 text-xs">
                      {Number(sale.totalMeters).toFixed(2)} m
                    </td>
                    <td className="px-3 py-2 font-bold text-green-400 text-xs">
                      ${Number(sale.total).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/20 text-blue-300 capitalize">
                        {sale.paymentMethod}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">
                      {format(new Date(sale.createdAt), "dd/MM/yy HH:mm", { locale: es })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredSales.length === 0 && (
              <div className="text-center py-12">
                <Receipt className="w-12 h-12 mx-auto mb-2 text-gray-600" />
                <p className="text-gray-400 text-sm">No hay ventas en este período</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
