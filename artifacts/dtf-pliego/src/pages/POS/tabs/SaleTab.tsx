import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Calculator, User, DollarSign, Receipt, Printer, Download } from "lucide-react";
import TicketModal from "../components/TicketModal";

const API_BASE = "/api";

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  priceType: string;
  customPricePerMeter?: string;
}

interface SaleData {
  folio: string;
  customerName: string;
  totalMeters: number;
  pricePerMeter: number;
  subtotal: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
}

export default function SaleTab() {
  const { token } = useAuth();
  const [meters, setMeters] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pricePerMeter, setPricePerMeter] = useState(0);
  const [total, setTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showTicket, setShowTicket] = useState(false);
  const [lastSale, setLastSale] = useState<SaleData | null>(null);

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

  const calculatePrice = async () => {
    if (!meters || Number(meters) <= 0) {
      setTotal(0);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/pos/calculate-price`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          meters: Number(meters),
          customerId: selectedCustomer?.id,
        }),
      });
      
      const data = await res.json();
      setPricePerMeter(data.pricePerMeter);
      setTotal(data.total);
    } catch (err) {
      console.error("Error calculating price:", err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      calculatePrice();
    }, 300);
    return () => clearTimeout(timer);
  }, [meters, selectedCustomer]);

  const handleSale = async () => {
    if (!meters || Number(meters) <= 0) {
      alert("Ingresa los metros");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/pos/sales`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          customerId: selectedCustomer?.id,
          customerName: selectedCustomer?.name || "Cliente General",
          totalMeters: Number(meters),
          pricePerMeter,
          subtotal: total,
          total,
          paymentMethod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLastSale(data.sale);
        setShowTicket(true);
        // Reset form
        setMeters("");
        setSelectedCustomer(null);
        setTotal(0);
      }
    } catch (err) {
      console.error("Error creating sale:", err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Customer Selection */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            Cliente
          </h3>
          <select
            value={selectedCustomer?.id || ""}
            onChange={(e) => {
              const customer = customers.find(c => c.id === Number(e.target.value));
              setSelectedCustomer(customer || null);
            }}
            className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
          >
            <option value="">Cliente General</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} - {customer.priceType}
              </option>
            ))}
          </select>
        </div>

        {/* Meters Input */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-orange-500" />
            Cantidad de Metros
          </h3>
          <input
            type="number"
            step="0.01"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-3 text-2xl font-bold rounded-lg border-2 border-gray-200 focus:border-orange-500 focus:outline-none transition-colors"
          />
        </div>

        {/* Payment Method */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            Método de Pago
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {['efectivo', 'tarjeta', 'transferencia'].map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`
                  px-4 py-3 rounded-lg font-medium capitalize transition-all
                  ${paymentMethod === method
                    ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {method}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-orange-500 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
          <h3 className="text-sm font-medium opacity-90 mb-2">Total a Pagar</h3>
          <p className="text-4xl font-bold mb-4">${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
          
          <div className="space-y-2 text-sm opacity-90">
            <div className="flex justify-between">
              <span>Metros:</span>
              <span className="font-medium">{meters || '0.00'} m</span>
            </div>
            <div className="flex justify-between">
              <span>Precio/Metro:</span>
              <span className="font-medium">${pricePerMeter.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Método:</span>
              <span className="font-medium capitalize">{paymentMethod}</span>
            </div>
          </div>

          <button
            onClick={handleSale}
            className="w-full mt-6 bg-white text-orange-600 px-6 py-3 rounded-lg font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
          >
            <Receipt className="w-5 h-5" />
            Registrar Venta
          </button>
        </div>
      </div>

      {/* Ticket Modal */}
      {showTicket && lastSale && (
        <TicketModal
          sale={lastSale}
          onClose={() => setShowTicket(false)}
        />
      )}
    </div>
  );
}
