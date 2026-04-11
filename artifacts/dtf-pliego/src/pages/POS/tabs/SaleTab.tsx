import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { 
  Plus, User, DollarSign, Receipt, ShoppingBag, Package, 
  Trash2, X, Check, Sparkles, Zap, ChevronRight, Search, Download, Printer
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const API_BASE = "/api";

interface Customer {
  id: number;
  name: string;
  priceType: string;
}

interface InventoryItem {
  id: number;
  productName: string;
  stock: string;
  unit: string;
  cost: string;
  price?: string;
  imageUrl?: string;
}

interface CartItem {
  id: string;
  type: 'metros' | 'producto';
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface BusinessConfig {
  businessName: string;
  address?: string;
  phone?: string;
  rfc?: string;
  logoUrl?: string;
  ticketHeader?: string;
  ticketFooter?: string;
}

export default function SaleTab() {
  const { token } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [config, setConfig] = useState<BusinessConfig>({ businessName: "DTF Pliego" });
  
  const [showAddMeters, setShowAddMeters] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  
  const [metersForm, setMetersForm] = useState({ quantity: "", price: "" });
  const [productSearch, setProductSearch] = useState("");
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", priceType: "normal" });
  const [folio, setFolio] = useState("");
  const [loading, setLoading] = useState(false);

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchCustomers();
    fetchInventory();
    fetchConfig();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/customers`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) { console.error(err); }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/inventory`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setInventory(data.items || []);
    } catch (err) { console.error(err); }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/config`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch (err) { console.error(err); }
  };

  const calculateMetersPrice = async (meters: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/calculate-price`, {
        method: "POST", headers,
        body: JSON.stringify({ meters, customerId: selectedCustomer?.id }),
      });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      return data.pricePerMeter;
    } catch (err) { return 0; }
  };

  const addMetersToCart = async () => {
    if (!metersForm.quantity || Number(metersForm.quantity) <= 0) {
      toast.error("Ingresa los metros");
      return;
    }
    const quantity = Number(metersForm.quantity);
    let price = Number(metersForm.price) || await calculateMetersPrice(quantity);
    setCart([...cart, {
      id: `metros-${Date.now()}`, type: 'metros', name: `Impresión DTF`,
      quantity, price, total: quantity * price,
    }]);
    setMetersForm({ quantity: "", price: "" });
    setShowAddMeters(false);
    toast.success("Agregado al carrito");
  };

  const addProductToCart = (product: InventoryItem) => {
    const quantity = 1;
    const price = Number(product.price) || Number(product.cost);
    setCart([...cart, {
      id: `product-${Date.now()}`, type: 'producto', name: product.productName,
      quantity, price, total: quantity * price,
    }]);
    setShowAddProduct(false);
    toast.success("Producto agregado");
  };

  const createCustomer = async () => {
    if (!customerForm.name) { toast.error("Ingresa el nombre"); return; }
    try {
      const res = await fetch(`${API_BASE}/admin/pos/customers`, {
        method: "POST", headers, body: JSON.stringify(customerForm),
      });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      await fetchCustomers();
      setSelectedCustomer(data.customer);
      setCustomerForm({ name: "", phone: "", priceType: "normal" });
      setShowAddCustomer(false);
      toast.success("Cliente creado");
    } catch (err) { toast.error("Error al crear cliente"); }
  };

  const updateCartItem = (id: string, field: 'quantity' | 'price', value: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        updated.total = updated.quantity * updated.price;
        return updated;
      }
      return item;
    }));
  };

  const removeCartItem = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
    toast.success("Eliminado");
  };

  const handleSale = async () => {
    if (cart.length === 0) { 
      toast.error("El carrito está vacío"); 
      return; 
    }

    setLoading(true);
    try {
      const totalVenta = cart.reduce((sum, item) => sum + item.total, 0);
      const subtotalVenta = totalVenta / 1.16;
      const ivaVenta = totalVenta - subtotalVenta;
      
      // Generar folio único
      const folioGenerated = `DTF${Date.now().toString().slice(-8)}`;
      
      // Registrar venta (por ahora solo metros)
      const metrosItems = cart.filter(i => i.type === 'metros');
      
      if (metrosItems.length > 0) {
        const totalMeters = metrosItems.reduce((sum, i) => sum + i.quantity, 0);
        const avgPrice = metrosItems.reduce((sum, i) => sum + (i.price * i.quantity), 0) / totalMeters;
        
        const res = await fetch(`${API_BASE}/admin/pos/sales`, {
          method: "POST", headers,
          body: JSON.stringify({
            customerId: selectedCustomer?.id,
            customerName: selectedCustomer?.name || "Cliente General",
            totalMeters: totalMeters,
            pricePerMeter: avgPrice,
            subtotal: totalVenta,
            total: totalVenta,
            paymentMethod,
            folio: folioGenerated,
          }),
        });

        if (!res.ok) throw new Error('Error al registrar venta');
      }

      setFolio(folioGenerated);
      setShowTicket(true);
      toast.success("¡Venta registrada! Folio: " + folioGenerated);
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar venta");
    } finally {
      setLoading(false);
    }
  };

  const resetSale = () => {
    setCart([]); 
    setSelectedCustomer(null); 
    setPaymentMethod("efectivo");
    setShowTicket(false); 
    setFolio("");
    toast.success("Listo para nueva venta");
  };

  const total = cart.reduce((sum, item) => sum + item.total, 0);
  const subtotal = total / 1.16;
  const iva = total - subtotal;

  const filteredProducts = inventory.filter(p =>
    p.productName.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTicket = () => {
    const ticketText = `
${config.businessName}
${config.address || ''}
${config.phone ? 'Tel: ' + config.phone : ''}
${config.rfc ? 'RFC: ' + config.rfc : ''}

================================
Folio: ${folio}
${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}
================================

Cliente: ${selectedCustomer?.name || 'Cliente General'}

${cart.map(item => `${item.name}
  ${item.quantity} x $${item.price.toFixed(2)} = $${item.total.toFixed(2)}`).join('\n\n')}

================================
Subtotal:     $${subtotal.toFixed(2)}
IVA (16%):    $${iva.toFixed(2)}
================================
TOTAL:        $${total.toFixed(2)}
================================

Pago: ${paymentMethod.toUpperCase()}

${config.ticketFooter || ''}
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
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 h-[calc(100vh-12rem)]">
      <div className="xl:col-span-2 space-y-3 overflow-y-auto pr-2">
        {/* Cliente + Métodos de Pago */}
        <div className="grid grid-cols-2 gap-3">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl opacity-20 group-hover:opacity-40 blur-sm transition-all duration-300"></div>
            <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-400" />Cliente
                </h3>
                <button onClick={() => setShowAddCustomer(true)}
                  className="px-2 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded text-xs font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <select value={selectedCustomer?.id || ""}
                onChange={(e) => setSelectedCustomer(customers.find(c => c.id === Number(e.target.value)) || null)}
                className="w-full px-2 py-1.5 text-sm rounded-lg bg-gray-900/50 border border-gray-700/50 text-white focus:border-blue-500 focus:outline-none transition-all duration-300"
              >
                <option value="">General</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl opacity-20 group-hover:opacity-40 blur-sm transition-all duration-300"></div>
            <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-green-400" />Pago
              </h3>
              <div className="flex gap-1.5">
                {[{ val: 'efectivo', label: 'Efectivo' }, { val: 'tarjeta', label: 'Tarjeta' }, { val: 'transferencia', label: 'Transfer' }].map((m) => (
                  <button key={m.val} onClick={() => setPaymentMethod(m.val)}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 transform ${
                      paymentMethod === m.val
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg scale-105'
                        : 'bg-gray-700/50 text-gray-300 hover:scale-105'
                    }`}>{m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Carrito */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl opacity-20 blur-sm transition-all duration-300"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-orange-400" />Carrito ({cart.length})
              </h3>
              <div className="flex gap-1.5">
                <button onClick={() => setShowAddMeters(true)}
                  className="px-2 py-1 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded text-xs font-medium hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />Metros
                </button>
                <button onClick={() => setShowAddProduct(true)}
                  className="px-2 py-1 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded text-xs font-medium hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center gap-1"
                >
                  <Package className="w-3 h-3" />Producto
                </button>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-6 text-gray-500">
                <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Carrito vacío</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.id}
                    className="bg-gray-900/50 rounded-lg p-2 border border-gray-700/50 hover:border-orange-500/50 transition-all duration-300"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-white text-xs flex items-center gap-1">
                          {item.type === 'metros' ? <Zap className="w-3 h-3 text-orange-400" /> : <Package className="w-3 h-3 text-purple-400" />}
                          {item.name}
                        </h4>
                        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                          <div>
                            <label className="text-[10px] text-gray-400 block">Cant</label>
                            <input type="number" step="0.01" value={item.quantity}
                              onChange={(e) => updateCartItem(item.id, 'quantity', Number(e.target.value))}
                              className="w-full px-1.5 py-1 rounded text-xs bg-gray-800 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block">$</label>
                            <input type="number" step="0.01" value={item.price}
                              onChange={(e) => updateCartItem(item.id, 'price', Number(e.target.value))}
                              className="w-full px-1.5 py-1 rounded text-xs bg-gray-800 border border-gray-700 text-white focus:border-orange-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block">Total</label>
                            <div className="px-1.5 py-1 rounded bg-green-500/20 border border-green-500/30 text-green-400 font-bold text-xs">
                              ${item.total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeCartItem(item.id)}
                        className="p-1 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="space-y-3 overflow-y-auto pr-2">
        <div className="sticky top-0">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 rounded-xl opacity-30 blur-sm animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 backdrop-blur-xl rounded-xl p-4 border border-gray-700/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
                <h3 className="text-xs font-medium text-gray-400">Total</h3>
              </div>
              <div className="text-4xl font-bold bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent mb-3">
                ${total.toFixed(2)}
              </div>
              
              <div className="space-y-1 mb-3 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Items:</span><span className="text-white">{cart.length}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Subtotal:</span><span className="text-white">${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">IVA (16%):</span><span className="text-white">${iva.toFixed(2)}</span></div>
              </div>

              <button onClick={handleSale} disabled={cart.length === 0 || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white rounded-lg font-bold text-sm hover:shadow-2xl transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Receipt className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
                    Registrar
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                  </>
                )}
              </button>
            </div>
          </div>

          {showTicket && <TicketPreview config={config} cart={cart} folio={folio} customer={selectedCustomer} paymentMethod={paymentMethod} subtotal={subtotal} iva={iva} total={total} onReset={resetSale} onPrint={handlePrint} onDownload={handleDownloadTicket} />}
        </div>
      </div>

      {/* Modals */}
      {showAddMeters && <MetersModal form={metersForm} setForm={setMetersForm} onAdd={addMetersToCart} onClose={() => setShowAddMeters(false)} />}
      {showAddProduct && <ProductsModal products={filteredProducts} search={productSearch} setSearch={setProductSearch} onSelect={addProductToCart} onClose={() => setShowAddProduct(false)} />}
      {showAddCustomer && <CustomerModal form={customerForm} setForm={setCustomerForm} onCreate={createCustomer} onClose={() => setShowAddCustomer(false)} />}
    </div>
  );
}

function TicketPreview({ config, cart, folio, customer, paymentMethod, subtotal, iva, total, onReset, onPrint, onDownload }: any) {
  return (
    <div className="mt-3 bg-gray-800/90 backdrop-blur-xl rounded-xl p-3 border border-gray-700/50">
      <h3 className="text-sm font-bold text-white mb-2">Ticket - {folio}</h3>
      <div className="bg-white rounded-lg p-3 font-['Courier_New',monospace] text-[10px] text-black max-h-64 overflow-y-auto">
        {config.logoUrl && <img src={config.logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-2 object-contain" />}
        <div className="text-center border-b border-dashed border-gray-300 pb-2 mb-2">
          <h3 className="text-sm font-bold">{config.businessName}</h3>
          {config.address && <p className="text-[9px]">{config.address}</p>}
          {config.phone && <p className="text-[9px]">Tel: {config.phone}</p>}
          {config.rfc && <p className="text-[9px]">RFC: {config.rfc}</p>}
        </div>
        <div className="text-center mb-2">
          <p className="font-bold text-xs">Folio: {folio}</p>
          <p className="text-[9px]">{format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}</p>
        </div>
        <div className="border-t border-dashed border-gray-300 pt-2 mb-2">
          <p className="text-xs">Cliente: {customer?.name || 'General'}</p>
        </div>
        {cart.map((item: any, i: number) => (
          <div key={i} className="mb-1.5">
            <div className="flex justify-between font-bold text-xs">
              <span>{item.name}</span>
              <span>${item.total.toFixed(2)}</span>
            </div>
            <div className="text-[9px] text-gray-600 ml-2">
              {item.quantity} x ${item.price.toFixed(2)}
            </div>
          </div>
        ))}
        <div className="border-t border-dashed border-gray-300 pt-2 mb-1 text-xs">
          <div className="flex justify-between"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>IVA (16%):</span><span>${iva.toFixed(2)}</span></div>
          <div className="flex justify-between font-bold text-sm mt-1"><span>TOTAL:</span><span>${total.toFixed(2)}</span></div>
        </div>
        <div className="text-center text-[9px] border-t border-dashed border-gray-300 pt-2">
          <p>Pago: {paymentMethod.toUpperCase()}</p>
          {config.ticketFooter && <p className="mt-1">{config.ticketFooter}</p>}
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={onPrint}
          className="flex-1 px-2 py-2 bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1"
        >
          <Printer className="w-3 h-3" />Imprimir
        </button>
        <button onClick={onDownload}
          className="flex-1 px-2 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1"
        >
          <Download className="w-3 h-3" />TXT
        </button>
      </div>
      <button onClick={onReset}
        className="w-full mt-2 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg text-xs font-medium hover:shadow-lg transition-all transform hover:scale-105 flex items-center justify-center gap-1.5"
      >
        <Check className="w-3.5 h-3.5" />Nueva Venta
      </button>
    </div>
  );
}

function MetersModal({ form, setForm, onAdd, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Agregar Metros</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">Cantidad</label>
            <input type="number" step="0.01" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0.00" autoFocus
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-lg font-bold focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">Precio (opcional)</label>
            <input type="number" step="0.01" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="Automático"
              className="w-full px-3 py-2 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-orange-500 focus:outline-none"
            />
          </div>
          <button onClick={onAdd}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-bold text-sm hover:shadow-lg transition-all transform hover:scale-105"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductsModal({ products, search, setSearch, onSelect, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full border border-gray-700 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Seleccionar Producto</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar productos..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm focus:border-purple-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {products.map((product: any) => (
              <button key={product.id} onClick={() => onSelect(product)}
                className="group relative bg-gray-900/50 rounded-xl p-3 border border-gray-700/50 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-105 text-left"
              >
                <div className="aspect-square rounded-lg overflow-hidden mb-2 bg-gray-800">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.productName}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-white text-sm mb-1 line-clamp-2">{product.productName}</h3>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400">Stock: {product.stock}</span>
                  <span className="font-bold text-green-400">${Number(product.price || product.cost).toFixed(0)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerModal({ form, setForm, onCreate, onClose }: any) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Nuevo Cliente</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input type="text" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre *" autoFocus
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-sm focus:border-blue-500 focus:outline-none"
          />
          <input type="tel" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Teléfono"
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-sm focus:border-blue-500 focus:outline-none"
          />
          <select value={form.priceType}
            onChange={(e) => setForm({ ...form, priceType: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="normal">Normal</option>
            <option value="revendedor">Revendedor</option>
            <option value="especial">Especial</option>
          </select>
          <button onClick={onCreate}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-bold text-sm hover:shadow-lg transition-all transform hover:scale-105"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}
