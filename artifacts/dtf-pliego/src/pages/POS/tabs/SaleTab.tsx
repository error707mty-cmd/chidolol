import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { 
  Plus, User, DollarSign, Receipt, ShoppingBag, Package, 
  Trash2, X, Check, Sparkles, Zap, ChevronRight
} from "lucide-react";
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

interface InventoryItem {
  id: number;
  productName: string;
  stock: string;
  unit: string;
  cost: string;
}

interface CartItem {
  id: string;
  type: 'metros' | 'producto';
  name: string;
  quantity: number;
  price: number;
  total: number;
  productId?: number;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [config, setConfig] = useState<BusinessConfig>({ businessName: "DTF Pliego" });
  
  // Modals
  const [showAddMeters, setShowAddMeters] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  
  // Forms
  const [metersForm, setMetersForm] = useState({ quantity: "", price: "" });
  const [productForm, setProductForm] = useState({ productId: "", quantity: "", price: "" });
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", priceType: "normal" });
  const [folio, setFolio] = useState("");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

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
    } catch (err) {
      console.error(err);
    }
  };

  const fetchInventory = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/inventory`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setInventory(data.items || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/config`, { headers });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch (err) {
      console.error(err);
    }
  };

  const calculateMetersPrice = async (meters: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/calculate-price`, {
        method: "POST",
        headers,
        body: JSON.stringify({ meters, customerId: selectedCustomer?.id }),
      });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      return data.pricePerMeter;
    } catch (err) {
      console.error(err);
      return 0;
    }
  };

  const addMetersToCart = async () => {
    if (!metersForm.quantity || Number(metersForm.quantity) <= 0) {
      toast.error("Ingresa los metros");
      return;
    }

    const quantity = Number(metersForm.quantity);
    let price = Number(metersForm.price);
    
    if (!price) {
      price = await calculateMetersPrice(quantity);
    }

    const newItem: CartItem = {
      id: `metros-${Date.now()}`,
      type: 'metros',
      name: `Impresión DTF`,
      quantity,
      price,
      total: quantity * price,
    };

    setCart([...cart, newItem]);
    setMetersForm({ quantity: "", price: "" });
    setShowAddMeters(false);
    toast.success("Metros agregados al carrito");
  };

  const addProductToCart = () => {
    if (!productForm.productId || !productForm.quantity) {
      toast.error("Completa todos los campos");
      return;
    }

    const product = inventory.find(p => p.id === Number(productForm.productId));
    if (!product) return;

    const quantity = Number(productForm.quantity);
    const price = Number(productForm.price) || Number(product.cost);

    const newItem: CartItem = {
      id: `product-${Date.now()}`,
      type: 'producto',
      name: product.productName,
      quantity,
      price,
      total: quantity * price,
      productId: product.id,
    };

    setCart([...cart, newItem]);
    setProductForm({ productId: "", quantity: "", price: "" });
    setShowAddProduct(false);
    toast.success("Producto agregado al carrito");
  };

  const createCustomer = async () => {
    if (!customerForm.name) {
      toast.error("Ingresa el nombre");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/pos/customers`, {
        method: "POST",
        headers,
        body: JSON.stringify(customerForm),
      });

      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      await fetchCustomers();
      setSelectedCustomer(data.customer);
      setCustomerForm({ name: "", phone: "", priceType: "normal" });
      setShowAddCustomer(false);
      toast.success("Cliente creado");
    } catch (err) {
      console.error(err);
      toast.error("Error al crear cliente");
    }
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
    toast.success("Item eliminado");
  };

  const handleSale = async () => {
    if (cart.length === 0) {
      toast.error("Agrega items al carrito");
      return;
    }

    try {
      for (const item of cart) {
        if (item.type === 'metros') {
          await fetch(`${API_BASE}/admin/pos/sales`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              customerId: selectedCustomer?.id,
              customerName: selectedCustomer?.name || "Cliente General",
              totalMeters: item.quantity,
              pricePerMeter: item.price,
              subtotal: item.total,
              total: item.total,
              paymentMethod,
            }),
          });
        }
      }

      const folioGenerated = `DTF${Date.now().toString().slice(-8)}`;
      setFolio(folioGenerated);
      setShowTicket(true);
      toast.success("¡Venta registrada!");
    } catch (err) {
      console.error(err);
      toast.error("Error al registrar venta");
    }
  };

  const resetSale = () => {
    setCart([]);
    setSelectedCustomer(null);
    setPaymentMethod("efectivo");
    setShowTicket(false);
    setFolio("");
  };

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const total = subtotal;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Left: Cart */}
      <div className="xl:col-span-2 space-y-4">
        {/* Customer Selection */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl opacity-20 group-hover:opacity-40 blur transition duration-300"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <User className="w-5 h-5 text-blue-400" />
                Cliente
              </h3>
              <button
                onClick={() => setShowAddCustomer(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all duration-300 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nuevo
              </button>
            </div>
            <select
              value={selectedCustomer?.id || ""}
              onChange={(e) => {
                const customer = customers.find(c => c.id === Number(e.target.value));
                setSelectedCustomer(customer || null);
              }}
              className="w-full px-4 py-3 rounded-xl bg-gray-900/50 border-2 border-gray-700/50 text-white focus:border-blue-500 focus:outline-none transition-all duration-300 backdrop-blur-sm"
            >
              <option value="">Cliente General</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.priceType})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cart Items */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl opacity-20 group-hover:opacity-40 blur transition duration-300"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-orange-400" />
                Carrito ({cart.length} items)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddMeters(true)}
                  className="px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-orange-500/50 transition-all duration-300 flex items-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Metros
                </button>
                <button
                  onClick={() => setShowAddProduct(true)}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-lg text-sm font-medium hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300 flex items-center gap-2"
                >
                  <Package className="w-4 h-4" />
                  Producto
                </button>
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">Carrito vacío</p>
                <p className="text-sm mt-2">Agrega metros o productos para comenzar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div
                    key={item.id}
                    className="bg-gray-900/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 hover:border-orange-500/50 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-bold text-white flex items-center gap-2">
                          {item.type === 'metros' ? (
                            <Zap className="w-4 h-4 text-orange-400" />
                          ) : (
                            <Package className="w-4 h-4 text-purple-400" />
                          )}
                          {item.name}
                        </h4>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Cantidad</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={(e) => updateCartItem(item.id, 'quantity', Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Precio</label>
                            <input
                              type="number"
                              step="0.01"
                              value={item.price}
                              onChange={(e) => updateCartItem(item.id, 'price', Number(e.target.value))}
                              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-orange-500 focus:outline-none transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Total</label>
                            <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 font-bold text-sm">
                              ${item.total.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className="ml-3 p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl opacity-20 group-hover:opacity-40 blur transition duration-300"></div>
          <div className="relative bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
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
                    px-4 py-3 rounded-xl font-medium capitalize transition-all duration-300
                    ${paymentMethod === method
                      ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/50 scale-105'
                      : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50'
                    }
                  `}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Summary */}
      <div className="space-y-4">
        <div className="sticky top-24 space-y-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-300 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                <h3 className="text-sm font-medium text-gray-400">Total a Pagar</h3>
              </div>
              <div className="text-5xl font-bold bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent mb-6">
                ${total.toFixed(2)}
              </div>
              
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Items:</span>
                  <span className="font-medium text-white">{cart.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Subtotal:</span>
                  <span className="font-medium text-white">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Método:</span>
                  <span className="font-medium text-green-400 capitalize">{paymentMethod}</span>
                </div>
              </div>

              <button
                onClick={handleSale}
                disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-600 text-white rounded-xl font-bold text-lg hover:shadow-2xl hover:shadow-orange-500/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <Receipt className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                Registrar Venta
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              </button>
            </div>
          </div>

          {/* Ticket Preview */}
          {showTicket && (
            <div className="bg-gray-800/90 backdrop-blur-xl rounded-2xl p-6 border border-gray-700/50">
              <h3 className="text-lg font-bold text-white mb-4">Ticket</h3>
              <div className="bg-white rounded-lg p-6 font-mono text-sm text-black">
                <div className="text-center border-b-2 border-dashed border-gray-300 pb-3 mb-3">
                  <h3 className="text-lg font-bold">{config.businessName}</h3>
                  {config.address && <p className="text-xs">{config.address}</p>}
                  {config.phone && <p className="text-xs">Tel: {config.phone}</p>}
                </div>
                <div className="text-center mb-3">
                  <p className="font-bold">Folio: {folio}</p>
                  <p className="text-xs">{format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}</p>
                </div>
                <div className="border-t-2 border-dashed border-gray-300 pt-3 mb-3">
                  <p>Cliente: {selectedCustomer?.name || 'Cliente General'}</p>
                </div>
                {cart.map((item, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between font-bold">
                      <span>{item.name}</span>
                      <span>${item.total.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-gray-600 ml-2">
                      {item.quantity} x ${item.price.toFixed(2)}
                    </div>
                  </div>
                ))}
                <div className="border-t-2 border-dashed border-gray-300 pt-3 mb-3">
                  <div className="flex justify-between font-bold text-lg">
                    <span>TOTAL:</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-center text-xs">
                  <p>Pago: {paymentMethod.toUpperCase()}</p>
                </div>
              </div>
              <button
                onClick={resetSale}
                className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Nueva Venta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddMeters && (
        <Modal title="Agregar Metros" onClose={() => setShowAddMeters(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Cantidad de Metros</label>
              <input
                type="number"
                step="0.01"
                value={metersForm.quantity}
                onChange={(e) => setMetersForm({ ...metersForm, quantity: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white text-xl font-bold focus:border-orange-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Precio por Metro (opcional)</label>
              <input
                type="number"
                step="0.01"
                value={metersForm.price}
                onChange={(e) => setMetersForm({ ...metersForm, price: e.target.value })}
                placeholder="Automático según escala"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              onClick={addMetersToCart}
              className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-lg font-bold hover:shadow-lg transition-all"
            >
              Agregar al Carrito
            </button>
          </div>
        </Modal>
      )}

      {showAddProduct && (
        <Modal title="Agregar Producto" onClose={() => setShowAddProduct(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Producto</label>
              <select
                value={productForm.productId}
                onChange={(e) => setProductForm({ ...productForm, productId: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              >
                <option value="">Selecciona un producto</option>
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.productName} (Stock: {item.stock} {item.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Cantidad</label>
              <input
                type="number"
                step="0.01"
                value={productForm.quantity}
                onChange={(e) => setProductForm({ ...productForm, quantity: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Precio (opcional)</label>
              <input
                type="number"
                step="0.01"
                value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                placeholder="Automático según costo"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-purple-500 focus:outline-none"
              />
            </div>
            <button
              onClick={addProductToCart}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-lg font-bold hover:shadow-lg transition-all"
            >
              Agregar al Carrito
            </button>
          </div>
        </Modal>
      )}

      {showAddCustomer && (
        <Modal title="Nuevo Cliente Rápido" onClose={() => setShowAddCustomer(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Nombre *</label>
              <input
                type="text"
                value={customerForm.name}
                onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                placeholder="Nombre del cliente"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Teléfono</label>
              <input
                type="tel"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                placeholder="Teléfono (opcional)"
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Tipo de Precio</label>
              <select
                value={customerForm.priceType}
                onChange={(e) => setCustomerForm({ ...customerForm, priceType: e.target.value })}
                className="w-full px-4 py-3 rounded-lg bg-gray-900 border-2 border-gray-700 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="revendedor">Revendedor</option>
                <option value="especial">Especial</option>
              </select>
            </div>
            <button
              onClick={createCustomer}
              className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-bold hover:shadow-lg transition-all"
            >
              Crear Cliente
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
