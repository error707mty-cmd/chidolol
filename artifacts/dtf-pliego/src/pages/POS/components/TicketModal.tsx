import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Printer, Download } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const API_BASE = "/api";

interface Sale {
  folio: string;
  customerName: string;
  totalMeters: number;
  pricePerMeter: number;
  subtotal: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
}

interface BusinessConfig {
  businessName: string;
  address?: string;
  phone?: string;
  email?: string;
  rfc?: string;
  ticketHeader?: string;
  ticketFooter?: string;
}

interface TicketModalProps {
  sale: Sale;
  onClose: () => void;
}

export default function TicketModal({ sale, onClose }: TicketModalProps) {
  const { token } = useAuth();
  const [config, setConfig] = useState<BusinessConfig>({
    businessName: "DTF Pliego",
  });
  const ticketRef = useRef<HTMLDivElement>(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/pos/config`, { headers });
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
      }
    } catch (err) {
      console.error("Error fetching config:", err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    // Create simple text-based PDF fallback
    const ticketText = `
${config.businessName}
${config.address || ''}
${config.phone ? 'Tel: ' + config.phone : ''}
${config.rfc ? 'RFC: ' + config.rfc : ''}

==================================
Folio: ${sale.folio}
Fecha: ${format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
==================================

Cliente: ${sale.customerName}

Metros: ${Number(sale.totalMeters).toFixed(2)} m
Precio/metro: $${Number(sale.pricePerMeter).toFixed(2)}
Subtotal: $${Number(sale.subtotal).toFixed(2)}

==================================
TOTAL: $${Number(sale.total).toFixed(2)}
==================================

Pago: ${sale.paymentMethod.toUpperCase()}

${config.ticketFooter || ''}
    `;

    // Create blob and download
    const blob = new Blob([ticketText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${sale.folio}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Modal Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">Ticket de Venta</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Ticket Preview */}
          <div ref={ticketRef} className="p-6">
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 font-mono text-sm">
              {/* Business Header */}
              <div className="text-center mb-4">
                <h3 className="text-lg font-bold">{config.businessName}</h3>
                {config.address && <p className="text-xs">{config.address}</p>}
                {config.phone && <p className="text-xs">Tel: {config.phone}</p>}
                {config.rfc && <p className="text-xs">RFC: {config.rfc}</p>}
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-3"></div>

              {/* Folio & Date */}
              <div className="text-center mb-3">
                <p className="font-bold">Folio: {sale.folio}</p>
                <p className="text-xs">
                  {format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                </p>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-3"></div>

              {/* Header */}
              {config.ticketHeader && (
                <div className="text-center mb-3 text-xs">
                  <p>{config.ticketHeader}</p>
                </div>
              )}

              {/* Customer */}
              <div className="mb-3">
                <p>Cliente: {sale.customerName}</p>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                <div className="flex justify-between">
                  <span>Metros:</span>
                  <span>{Number(sale.totalMeters).toFixed(2)} m</span>
                </div>
                <div className="flex justify-between">
                  <span>Precio/metro:</span>
                  <span>${Number(sale.pricePerMeter).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${Number(sale.subtotal).toFixed(2)}</span>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-3"></div>

              {/* Total */}
              <div className="flex justify-between font-bold text-lg mb-3">
                <span>TOTAL:</span>
                <span>${Number(sale.total).toFixed(2)}</span>
              </div>

              {/* Payment Method */}
              <div className="text-center mb-3">
                <p className="text-xs">Pago: {sale.paymentMethod.toUpperCase()}</p>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-3"></div>

              {/* Footer */}
              {config.ticketFooter && (
                <div className="text-center text-xs mt-3">
                  <p>{config.ticketFooter}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 p-6 border-t border-gray-200">
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-violet-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              <Printer className="w-5 h-5" />
              Imprimir
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
            >
              <Download className="w-5 h-5" />
              Descargar TXT
            </button>
          </div>
        </div>
      </div>

      {/* Print-only styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .fixed.inset-0 {
            position: static !important;
          }
          ${ticketRef.current ? `
            [ref="ticketRef"], [ref="ticketRef"] * {
              visibility: visible;
            }
            [ref="ticketRef"] {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
            }
          ` : ''}
        }
      `}</style>
    </>
  );
}
