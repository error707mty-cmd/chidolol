import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link } from "wouter";
import { LogoMark } from "@/components/LogoMark";
import { 
  ShoppingCart, Users, Package, History, BarChart3, 
  Calculator, Plus, Search, DollarSign, Receipt,
  ChevronLeft, Save, Printer, QrCode
} from "lucide-react";

const API_BASE = "/api";

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  priceType: string;
  customPricePerMeter?: string;
}

export default function POSPage() {
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"sale" | "customers" | "inventory" | "history">("sale");
  
  // Nueva Venta
  const [meters, setMeters] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [pricePerMeter, setPricePerMeter] = useState(250);
  const [total, setTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  
  // Clientes
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  
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

      const data = await res.json();
      alert(`✅ Venta registrada! Folio: ${data.sale.folio}`);
      
      // Reset form
      setMeters("");
      setTotal(0);
      setPricePerMeter(250);
      setSelectedCustomer(null);
    } catch (err) {
      console.error("Error creating sale:", err);
      alert("❌ Error al registrar la venta");
    }
  };

  if (!user?.isAdmin) {
    return (
      <div className="adm-gate">
        <p>Acceso denegado.</p>
        <Link href="/">Volver</Link>
      </div>
    );
  }

  return (
    <div className="adm-root">
      <div className="adm-orb adm-orb1" />
      <div className="adm-orb adm-orb2" />

      <header className="jl-header">
        <LogoMark size="sm" />
        <div className="jl-header-actions">
          <Link href="/admin" className="jl-admin-link">
            <ChevronLeft size={13} />
            Admin
          </Link>
          <span className="jl-admin-link" style={{ cursor: "default", background: "rgba(34,197,94,0.25)", borderColor: "rgba(74,222,128,0.5)" }}>
            <ShoppingCart size={13} />
            Punto de Venta
          </span>
        </div>
      </header>

      <main className="adm-main" style={{ maxWidth: "1400px" }}>
        <div className="adm-box">
          <div className="adm-box-title" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <ShoppingCart size={20} />
            <span>Sistema POS - DTF Studio</span>
          </div>

          {/* Tabs */}
          <div style={{ 
            display: "flex", 
            gap: "8px", 
            padding: "16px 24px 0", 
            borderBottom: "1px solid rgba(124,58,237,0.2)" 
          }}>
            <button
              onClick={() => setActiveTab("sale")}
              style={{
                padding: "8px 16px",
                background: activeTab === "sale" ? "rgba(34,197,94,0.2)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "sale" ? "rgba(74,222,128,0.5)" : "rgba(124,58,237,0.2)",
                borderRadius: "6px 6px 0 0",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              <Calculator size={16} />
              Nueva Venta
            </button>
            <button
              onClick={() => setActiveTab("customers")}
              style={{
                padding: "8px 16px",
                background: activeTab === "customers" ? "rgba(34,197,94,0.2)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "customers" ? "rgba(74,222,128,0.5)" : "rgba(124,58,237,0.2)",
                borderRadius: "6px 6px 0 0",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              <Users size={16} />
              Clientes ({customers.length})
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              style={{
                padding: "8px 16px",
                background: activeTab === "inventory" ? "rgba(34,197,94,0.2)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "inventory" ? "rgba(74,222,128,0.5)" : "rgba(124,58,237,0.2)",
                borderRadius: "6px 6px 0 0",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              <Package size={16} />
              Inventario
            </button>
            <button
              onClick={() => setActiveTab("history")}
              style={{
                padding: "8px 16px",
                background: activeTab === "history" ? "rgba(34,197,94,0.2)" : "transparent",
                border: "1px solid",
                borderColor: activeTab === "history" ? "rgba(74,222,128,0.5)" : "rgba(124,58,237,0.2)",
                borderRadius: "6px 6px 0 0",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "14px",
              }}
            >
              <History size={16} />
              Historial
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: "24px" }}>
            {activeTab === "sale" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                {/* Formulario de Venta */}
                <div style={{ 
                  background: "rgba(124,58,237,0.05)", 
                  border: "1px solid rgba(167,139,250,0.3)",
                  borderRadius: "12px",
                  padding: "24px"
                }}>
                  <h3 style={{ fontSize: "18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Calculator size={18} />
                    Calculadora de Venta
                  </h3>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "#a78bfa" }}>
                      Cliente
                    </label>
                    <select
                      value={selectedCustomer?.id || ""}
                      onChange={(e) => {
                        const customer = customers.find(c => c.id === Number(e.target.value));
                        setSelectedCustomer(customer || null);
                      }}
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(124,58,237,0.3)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "14px",
                      }}
                    >
                      <option value="">Cliente General (Normal)</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.priceType}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "#a78bfa" }}>
                      Metros
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={meters}
                      onChange={(e) => setMeters(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: "100%",
                        padding: "12px",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(124,58,237,0.3)",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "24px",
                        fontWeight: "600",
                        textAlign: "center",
                      }}
                    />
                  </div>

                  <div style={{ 
                    background: "rgba(34,197,94,0.1)", 
                    border: "1px solid rgba(74,222,128,0.3)",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "16px"
                  }}>
                    <div style={{ fontSize: "12px", color: "#86efac", marginBottom: "4px" }}>
                      Precio por metro
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "700", color: "#4ade80" }}>
                      ${pricePerMeter.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ 
                    background: "rgba(168,85,247,0.15)", 
                    border: "2px solid rgba(168,85,247,0.5)",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "20px"
                  }}>
                    <div style={{ fontSize: "14px", color: "#e9d5ff", marginBottom: "4px" }}>
                      TOTAL A COBRAR
                    </div>
                    <div style={{ fontSize: "42px", fontWeight: "800", color: "#d8b4fe" }}>
                      ${total.toFixed(2)}
                    </div>
                    <div style={{ fontSize: "11px", color: "#c4b5fd", marginTop: "4px" }}>
                      IVA incluido
                    </div>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", color: "#a78bfa" }}>
                      Método de Pago
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {["efectivo", "tarjeta", "transferencia"].map(method => (
                        <button
                          key={method}
                          onClick={() => setPaymentMethod(method)}
                          style={{
                            flex: 1,
                            padding: "10px",
                            background: paymentMethod === method ? "rgba(34,197,94,0.3)" : "rgba(0,0,0,0.3)",
                            border: "1px solid",
                            borderColor: paymentMethod === method ? "rgba(74,222,128,0.6)" : "rgba(124,58,237,0.3)",
                            borderRadius: "6px",
                            color: "#fff",
                            fontSize: "12px",
                            cursor: "pointer",
                            textTransform: "capitalize",
                          }}
                        >
                          {method}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSale}
                    disabled={!meters || Number(meters) <= 0}
                    style={{
                      width: "100%",
                      padding: "16px",
                      background: Number(meters) > 0 ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" : "rgba(100,100,100,0.3)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "16px",
                      fontWeight: "600",
                      cursor: Number(meters) > 0 ? "pointer" : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <DollarSign size={18} />
                    REGISTRAR VENTA
                  </button>
                </div>

                {/* Ticket Preview */}
                <div style={{ 
                  background: "rgba(255,255,255,0.05)", 
                  border: "1px solid rgba(167,139,250,0.3)",
                  borderRadius: "12px",
                  padding: "24px"
                }}>
                  <h3 style={{ fontSize: "18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Receipt size={18} />
                    Vista Previa Ticket
                  </h3>

                  <div style={{
                    background: "#fff",
                    color: "#000",
                    padding: "24px",
                    borderRadius: "8px",
                    fontFamily: "monospace",
                    fontSize: "12px",
                  }}>
                    <div style={{ textAlign: "center", marginBottom: "16px", borderBottom: "2px dashed #000", paddingBottom: "12px" }}>
                      <div style={{ fontSize: "16px", fontWeight: "700" }}>DTF STUDIO</div>
                      <div style={{ fontSize: "10px" }}>Impresión DTF Profesional</div>
                    </div>

                    <div style={{ marginBottom: "12px" }}>
                      <div>Folio: DTF{new Date().getFullYear()}{String(new Date().getMonth()+1).padStart(2,'0')}{String(new Date().getDate()).padStart(2,'0')}XXXX</div>
                      <div>Fecha: {new Date().toLocaleString('es-MX')}</div>
                      <div>Cliente: {selectedCustomer?.name || "Cliente General"}</div>
                    </div>

                    <div style={{ borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "12px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span>Metros:</span>
                        <span>{meters || "0.00"} m</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span>Precio/m:</span>
                        <span>${pricePerMeter.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "14px", marginTop: "8px" }}>
                        <span>TOTAL:</span>
                        <span>${total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "center", marginTop: "12px", fontSize: "10px" }}>
                      <div>Pago: {paymentMethod.toUpperCase()}</div>
                      <div style={{ marginTop: "12px" }}>¡Gracias por su compra!</div>
                    </div>

                    <div style={{ textAlign: "center", marginTop: "16px" }}>
                      <QrCode size={60} style={{ margin: "0 auto" }} />
                      <div style={{ fontSize: "9px", marginTop: "4px" }}>Escanea para más info</div>
                    </div>
                  </div>

                  <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                    <button style={{
                      flex: 1,
                      padding: "12px",
                      background: "rgba(59,130,246,0.2)",
                      border: "1px solid rgba(59,130,246,0.4)",
                      borderRadius: "6px",
                      color: "#60a5fa",
                      fontSize: "14px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}>
                      <Printer size={14} />
                      Imprimir
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "customers" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "18px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Users size={18} />
                    Gestión de Clientes
                  </h3>
                  <button style={{
                    padding: "10px 16px",
                    background: "rgba(34,197,94,0.2)",
                    border: "1px solid rgba(74,222,128,0.5)",
                    borderRadius: "6px",
                    color: "#4ade80",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}>
                    <Plus size={14} />
                    Nuevo Cliente
                  </button>
                </div>

                <div style={{ 
                  background: "rgba(124,58,237,0.05)", 
                  border: "1px solid rgba(167,139,250,0.3)",
                  borderRadius: "8px",
                  overflow: "hidden"
                }}>
                  <table style={{ width: "100%", fontSize: "14px" }}>
                    <thead style={{ background: "rgba(124,58,237,0.2)" }}>
                      <tr>
                        <th style={{ padding: "12px", textAlign: "left" }}>Nombre</th>
                        <th style={{ padding: "12px", textAlign: "left" }}>Tipo Precio</th>
                        <th style={{ padding: "12px", textAlign: "left" }}>Precio Custom</th>
                        <th style={{ padding: "12px", textAlign: "left" }}>Contacto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map(customer => (
                        <tr key={customer.id} style={{ borderTop: "1px solid rgba(124,58,237,0.2)" }}>
                          <td style={{ padding: "12px" }}>{customer.name}</td>
                          <td style={{ padding: "12px" }}>
                            <span style={{
                              padding: "4px 8px",
                              background: customer.priceType === "especial" ? "rgba(168,85,247,0.2)" : customer.priceType === "revendedor" ? "rgba(234,179,8,0.2)" : "rgba(100,116,139,0.2)",
                              borderRadius: "4px",
                              fontSize: "12px",
                            }}>
                              {customer.priceType}
                            </span>
                          </td>
                          <td style={{ padding: "12px" }}>
                            {customer.customPricePerMeter ? `$${customer.customPricePerMeter}/m` : "-"}
                          </td>
                          <td style={{ padding: "12px", fontSize: "12px", color: "#a78bfa" }}>
                            {customer.email || customer.phone || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "inventory" && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#a78bfa" }}>
                <Package size={48} style={{ margin: "0 auto 16px" }} />
                <h3 style={{ fontSize: "20px", marginBottom: "8px" }}>Inventario</h3>
                <p style={{ fontSize: "14px" }}>Próximamente: Control de stock y materiales</p>
              </div>
            )}

            {activeTab === "history" && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#a78bfa" }}>
                <History size={48} style={{ margin: "0 auto 16px" }} />
                <h3 style={{ fontSize: "20px", marginBottom: "8px" }}>Historial de Ventas</h3>
                <p style={{ fontSize: "14px" }}>Próximamente: Registro completo de ventas</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .adm-root { min-height: 100vh; background: #0a0118; color: #fff; position: relative; overflow-x: hidden; }
        .adm-orb { position: absolute; border-radius: 50%; filter: blur(120px); opacity: 0.15; pointer-events: none; }
        .adm-orb1 { width: 600px; height: 600px; background: radial-gradient(circle, #7c3aed 0%, transparent 70%); top: -200px; left: -150px; }
        .adm-orb2 { width: 500px; height: 500px; background: radial-gradient(circle, #22c55e 0%, transparent 70%); bottom: -100px; right: -100px; }
        
        .jl-header {
          background: rgba(10,1,24,0.8);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(124,58,237,0.3);
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        
        .jl-header-actions { display: flex; gap: 8px; align-items: center; }
        
        .jl-admin-link {
          padding: 6px 14px;
          border-radius: 6px;
          border: 1px solid rgba(124,58,237,0.3);
          background: rgba(124,58,237,0.1);
          color: #e9d5ff;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          text-decoration: none;
          transition: all 0.2s;
          cursor: pointer;
        }
        
        .jl-admin-link:hover { background: rgba(124,58,237,0.2); border-color: rgba(167,139,250,0.5); }
        
        .adm-main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; position: relative; }
        
        .adm-box {
          background: rgba(10,1,24,0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(124,58,237,0.3);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(124,58,237,0.2);
        }
        
        .adm-box-title {
          padding: 20px 24px;
          border-bottom: 1px solid rgba(124,58,237,0.3);
          font-size: 18px;
          font-weight: 600;
          color: #e9d5ff;
        }
        
        .adm-gate {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: #0a0118;
          color: #fff;
        }
      `}</style>
    </div>
  );
}
