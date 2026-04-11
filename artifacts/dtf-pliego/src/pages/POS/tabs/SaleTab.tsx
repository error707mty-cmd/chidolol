import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Calculator, User, DollarSign, Receipt, Check, X, Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const API_BASE = "/api";

interface Customer {
  id: number;
  name: string;
  priceType: string;
  customPricePerMeter?: string;
}

interface BusinessConfig {
  businessName: string;
  address?: string;
  phone?: string;
  rfc?: string;
  ticketHeader?: string;
  ticketFooter?: string;
}

export default function SaleTab() {
  const { token } = useAuth();
  const [meters, setMeters] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pricePerMeter, setPricePerMeter] = useState(0);
  const [total, setTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [config, setConfig] = useState<BusinessConfig>({ businessName: "DTF Pliego" });
  const [showTicket, setShowTicket] = useState(false);
  const [folio, setFolio] = useState("");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchCustomers();
    fetchConfig();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/customers`, { headers });
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      console.log('Clientes cargados:', data);
      setCustomers(data.customers || []);
    } catch (err) {
      console.error("Error fetching customers:", err);
      toast.error("Error al cargar clientes");
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/config`, { headers });
      if (!res.ok) throw new Error('Error al cargar config');
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch (err) {
      console.error("Error fetching config:", err);
    }
  };

  const calculatePrice = async () => {
    if (!meters || Number(meters) <= 0) {
      setTotal(0);
      setPricePerMeter(0);
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
      
      if (!res.ok) throw new Error('Error al calcular precio');
      const data = await res.json();
      setPricePerMeter(data.pricePerMeter);
      setTotal(data.total);
    } catch (err) {
      console.error("Error calculating price:", err);
      toast.error("Error al calcular precio");
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
      toast.error("Ingresa los metros");
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

      if (!res.ok) throw new Error('Error al crear venta');
      const data = await res.json();
      setFolio(data.sale.folio);
      setShowTicket(true);
      toast.success("¡Venta registrada!");
    } catch (err) {
      console.error("Error creating sale:", err);
      toast.error("Error al registrar venta");
    }
  };

  const resetSale = () => {
    setMeters("");
    setSelectedCustomer(null);
    setTotal(0);
    setPricePerMeter(0);
    setShowTicket(false);
    setFolio("");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const ticketText = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${config.businessName}
${config.address || ''}
${config.phone ? 'Tel: ' + config.phone : ''}
${config.rfc ? 'RFC: ' + config.rfc : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Folio: ${folio}
${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${config.ticketHeader || ''}

Cliente: ${selectedCustomer?.name || 'Cliente General'}

Metros:        ${Number(meters).toFixed(2)} m
Precio/metro:  $${pricePerMeter.toFixed(2)}
Subtotal:      $${total.toFixed(2)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:         $${total.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Pago: ${paymentMethod.toUpperCase()}

${config.ticketFooter || ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;

    const blob = new Blob([ticketText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${folio}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Form */}
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Cliente
          </h3>
          <select
            value={selectedCustomer?.id || ""}
            onChange={(e) => {
              const customer = customers.find(c => c.id === Number(e.target.value));
              setSelectedCustomer(customer || null);
            }}
            className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none transition-colors"
          >
            <option value="">Cliente General</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} ({customer.priceType})
              </option>
            ))}
          </select>
          {customers.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">No hay clientes. Ve a la pestaña Clientes para agregar.</p>
          )}
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-orange-400" />
            Metros
          </h3>
          <input
            type="number"
            step="0.01"
            value={meters}
            onChange={(e) => setMeters(e.target.value)}
            placeholder="0.00"
            className="w-full px-4 py-4 text-3xl font-bold rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors text-center"
          />
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" />
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
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }
                `}
              >
                {method}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSale}
          disabled={!meters || Number(meters) <= 0}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-orange-500 to-pink-600 text-white rounded-lg font-bold text-lg hover:shadow-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Receipt className="w-6 h-6" />
          Registrar Venta
        </button>
      </div>

      {/* Right: Preview */}
      <div>
        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 sticky top-24">
          <h3 className="text-lg font-bold text-white mb-4">Previsualización del Ticket</h3>
          
          <div className="bg-white rounded-lg p-6 font-mono text-sm text-black">
            {/* Business Header */}
            <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 mb-3">
              <h3 className="text-lg font-bold">{config.businessName}</h3>
              {config.address && <p className="text-xs">{config.address}</p>}
              {config.phone && <p className="text-xs">Tel: {config.phone}</p>}
              {config.rfc && <p className="text-xs">RFC: {config.rfc}</p>}
            </div>

            {/* Folio */}
            <div className="text-center mb-3">
              <p className="font-bold">{showTicket ? `Folio: ${folio}` : 'Folio: ------'}</p>
              <p className="text-xs">{format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}</p>
            </div>

            <div className="border-t-2 border-dashed border-gray-300 pt-3 mb-3">
              {config.ticketHeader && (
                <p className="text-center text-xs mb-3">{config.ticketHeader}</p>
              )}
            </div>

            {/* Customer */}
            <div className="mb-3">
              <p>Cliente: {selectedCustomer?.name || 'Cliente General'}</p>
            </div>

            {/* Items */}
            <div className="space-y-1 mb-3">
              <div className="flex justify-between">
                <span>Metros:</span>
                <span className="font-bold">{meters || '0.00'} m</span>
              </div>
              <div className="flex justify-between">
                <span>Precio/metro:</span>
                <span>${pricePerMeter.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="border-t-2 border-dashed border-gray-300 pt-3 mb-3">
              <div className="flex justify-between font-bold text-lg">
                <span>TOTAL:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment */}
            <div className="text-center mb-3">
              <p className="text-xs">Pago: {paymentMethod.toUpperCase()}</p>
            </div>

            {config.ticketFooter && (
              <div className="border-t-2 border-dashed border-gray-300 pt-3 text-center text-xs">
                <p>{config.ticketFooter}</p>
              </div>
            )}
          </div>

          {showTicket && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Printer className="w-5 h-5" />
                  Imprimir
                </button>
                <button
                  onClick={handleDownload}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Descargar
                </button>
              </div>
              <button
                onClick={resetSale}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
              >
                <Check className="w-5 h-5" />
                Nueva Venta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
