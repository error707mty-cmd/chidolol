import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { DollarSign, ShoppingBag, Users, Package, TrendingUp, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const API_BASE = "/api";

interface DailyReport {
  totalSales: number;
  totalRevenue: number;
  totalMeters: number;
  sales: any[];
}

export default function DashboardTab() {
  const { token } = useAuth();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchDailyReport();
  }, []);

  const fetchDailyReport = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/admin/pos/reports/daily`, { headers });
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error("Error fetching daily report:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const stats = [
    {
      label: "Ventas del Día",
      value: report?.totalSales || 0,
      icon: ShoppingBag,
      color: "from-orange-500 to-pink-500",
      bgColor: "bg-orange-50",
    },
    {
      label: "Ingresos del Día",
      value: `$${(report?.totalRevenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "from-green-400 to-emerald-500",
      bgColor: "bg-green-50",
    },
    {
      label: "Metros Vendidos",
      value: `${(report?.totalMeters || 0).toFixed(2)} m`,
      icon: Package,
      color: "from-blue-400 to-indigo-500",
      bgColor: "bg-blue-50",
    },
    {
      label: "Promedio por Venta",
      value: report?.totalSales ? `$${((report?.totalRevenue || 0) / report.totalSales).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : "$0.00",
      icon: TrendingUp,
      color: "from-purple-500 to-violet-500",
      bgColor: "bg-purple-50",
    },
  ];

  // Datos para gráfica de métodos de pago
  const paymentMethods = report?.sales?.reduce((acc: any, sale: any) => {
    const method = sale.paymentMethod || 'efectivo';
    if (!acc[method]) acc[method] = 0;
    acc[method] += Number(sale.total);
    return acc;
  }, {}) || {};

  const paymentData = Object.keys(paymentMethods).map(key => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: paymentMethods[key],
  }));

  const COLORS = ['#FF6B35', '#2E86DE', '#26DE81', '#FC5C9C', '#FED330'];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.bgColor} p-3 rounded-xl`}>
                  <Icon className={`w-6 h-6 bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`} style={{ WebkitTextFillColor: 'transparent', backgroundClip: 'text' }} />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</h3>
              <p className="text-sm text-gray-600">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Métodos de Pago
          </h3>
          {paymentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={paymentData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: $${entry.value.toFixed(2)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-gray-500 py-12">No hay ventas hoy</p>
          )}
        </div>

        {/* Recent Sales */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Ventas Recientes
          </h3>
          <div className="space-y-3 max-h-[250px] overflow-y-auto">
            {report?.sales && report.sales.length > 0 ? (
              report.sales.slice(0, 5).map((sale: any) => (
                <div key={sale.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{sale.customerName}</p>
                    <p className="text-sm text-gray-500">{sale.totalMeters} metros</p>
                  </div>
                  <p className="font-bold text-green-600">${Number(sale.total).toFixed(2)}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">No hay ventas hoy</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
