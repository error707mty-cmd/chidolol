import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { DollarSign, TrendingUp, TrendingDown, Calendar, Save } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const API_BASE = "/api";

interface DailyReport {
  totalSales: number;
  totalRevenue: number;
  totalMeters: number;
  sales: any[];
}

export default function CashRegisterTab() {
  const { token } = useAuth();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [initialCash, setInitialCash] = useState("0");
  const [expenses, setExpenses] = useState<any[]>([]);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "" });
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchDailyReport();
  }, []);

  const fetchDailyReport = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/reports/daily`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error("Error fetching daily report:", err);
    }
  };

  const addExpense = () => {
    if (!newExpense.description || !newExpense.amount) {
      toast.error("Completa todos los campos");
      return;
    }

    setExpenses([...expenses, {
      id: Date.now(),
      description: newExpense.description,
      amount: Number(newExpense.amount),
      date: new Date()
    }]);

    setNewExpense({ description: "", amount: "" });
    setShowExpenseForm(false);
    toast.success("Egreso agregado");
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const cashSales = report?.sales?.filter(s => s.paymentMethod === 'efectivo')
    .reduce((sum, s) => sum + Number(s.total), 0) || 0;
  const cardSales = report?.sales?.filter(s => s.paymentMethod === 'tarjeta')
    .reduce((sum, s) => sum + Number(s.total), 0) || 0;
  const transferSales = report?.sales?.filter(s => s.paymentMethod === 'transferencia')
    .reduce((sum, s) => sum + Number(s.total), 0) || 0;

  const expectedCash = Number(initialCash) + cashSales - totalExpenses;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Efectivo</p>
              <p className="text-2xl font-bold text-white">${cashSales.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Tarjeta</p>
              <p className="text-2xl font-bold text-white">${cardSales.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Transferencia</p>
              <p className="text-2xl font-bold text-white">${transferSales.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-600 to-pink-600 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-white/80">Total del Día</p>
              <p className="text-2xl font-bold text-white">${(report?.totalRevenue || 0).toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Initial Cash */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">Efectivo Inicial</h3>
          <input
            type="number"
            step="0.01"
            value={initialCash}
            onChange={(e) => setInitialCash(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-2xl font-bold focus:border-green-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Expected Cash */}
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4">Efectivo Esperado en Caja</h3>
          <div className="text-4xl font-bold text-green-400">
            ${expectedCash.toFixed(2)}
          </div>
          <p className="text-sm text-gray-400 mt-2">
            Inicial + Ventas en efectivo - Egresos
          </p>
        </div>
      </div>

      {/* Expenses */}
      <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Egresos del Día</h3>
          <button
            onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            + Agregar Egreso
          </button>
        </div>

        {showExpenseForm && (
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                placeholder="Descripción"
                className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-red-500 focus:outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={newExpense.amount}
                onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                placeholder="Monto"
                className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white focus:border-red-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3 mt-3">
              <button
                onClick={addExpense}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Guardar
              </button>
              <button
                onClick={() => setShowExpenseForm(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg">
              <div>
                <p className="text-white font-medium">{expense.description}</p>
                <p className="text-sm text-gray-400">
                  {format(expense.date, "dd/MM/yyyy HH:mm", { locale: es })}
                </p>
              </div>
              <p className="text-xl font-bold text-red-400">-${expense.amount.toFixed(2)}</p>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="text-center py-8 text-gray-500">No hay egresos registrados</p>
          )}
        </div>

        {expenses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
            <p className="text-lg font-bold text-white">Total Egresos:</p>
            <p className="text-2xl font-bold text-red-400">-${totalExpenses.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* Cash Count */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-green-400" />
          Arqueo de Caja - {format(new Date(), "dd MMMM yyyy", { locale: es })}
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Ventas en Efectivo</p>
            <p className="text-2xl font-bold text-green-400">${cashSales.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Egresos</p>
            <p className="text-2xl font-bold text-red-400">-${totalExpenses.toFixed(2)}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-sm text-gray-400 mb-1">Efectivo Esperado</p>
            <p className="text-2xl font-bold text-white">${expectedCash.toFixed(2)}</p>
          </div>
        </div>

        <button
          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-bold text-lg hover:shadow-2xl transition-all"
        >
          <Save className="w-6 h-6" />
          Cerrar Caja
        </button>
      </div>
    </div>
  );
}
