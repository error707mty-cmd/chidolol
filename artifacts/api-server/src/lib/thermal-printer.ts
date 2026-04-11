/**
 * ESC/POS Thermal Printer Helper
 * Genera comandos para impresoras térmicas POS58
 */

interface TicketData {
  folio: string;
  businessName: string;
  address?: string;
  phone?: string;
  rfc?: string;
  customerName: string;
  items: Array<{ name: string; quantity: number; price: number; total: number }>;
  subtotal: number;
  iva: number;
  total: number;
  paymentMethod: string;
  ticketHeader?: string;
  ticketFooter?: string;
}

export class ThermalPrinter {
  private static ESC = '\x1B';
  private static GS = '\x1D';

  /**
   * Inicializa la impresora
   */
  static init(): string {
    return `${this.ESC}@`; // Reset
  }

  /**
   * Alinea el texto
   */
  static align(position: 'left' | 'center' | 'right'): string {
    const alignments = { left: 0, center: 1, right: 2 };
    return `${this.ESC}a${alignments[position]}`;
  }

  /**
   * Establece el tamaño del texto
   */
  static textSize(width: number, height: number): string {
    const size = ((width - 1) << 4) | (height - 1);
    return `${this.GS}!${String.fromCharCode(size)}`;
  }

  /**
   * Texto en negrita
   */
  static bold(enabled: boolean): string {
    return `${this.ESC}E${enabled ? 1 : 0}`;
  }

  /**
   * Corta el papel
   */
  static cut(): string {
    return `${this.GS}V${String.fromCharCode(66)}${String.fromCharCode(0)}`; // Corte parcial
  }

  /**
   * Salta líneas
   */
  static feed(lines: number): string {
    return `${this.ESC}d${String.fromCharCode(lines)}`;
  }

  /**
   * Línea separadora
   */
  static separator(): string {
    return '================================\n';
  }

  /**
   * Genera el ticket completo para impresión térmica
   */
  static generateTicket(data: TicketData): string {
    let ticket = '';

    // Inicializar
    ticket += this.init();

    // Encabezado centrado
    ticket += this.align('center');
    ticket += this.bold(true);
    ticket += this.textSize(2, 2);
    ticket += `${data.businessName}\n`;
    ticket += this.textSize(1, 1);
    ticket += this.bold(false);

    if (data.address) ticket += `${data.address}\n`;
    if (data.phone) ticket += `Tel: ${data.phone}\n`;
    if (data.rfc) ticket += `RFC: ${data.rfc}\n`;

    ticket += this.feed(1);
    ticket += this.separator();

    // Folio y fecha
    ticket += this.bold(true);
    ticket += `Folio: ${data.folio}\n`;
    ticket += this.bold(false);
    ticket += `${new Date().toLocaleString('es-MX')}\n`;
    ticket += this.separator();

    // Cliente
    ticket += this.align('left');
    ticket += `Cliente: ${data.customerName}\n`;
    ticket += this.separator();

    // Items
    for (const item of data.items) {
      ticket += this.bold(true);
      ticket += `${item.name}\n`;
      ticket += this.bold(false);
      ticket += `  ${item.quantity} x $${item.price.toFixed(2)} = $${item.total.toFixed(2)}\n`;
    }

    ticket += this.separator();

    // Totales
    ticket += this.align('right');
    ticket += `Subtotal: $${data.subtotal.toFixed(2)}\n`;
    ticket += `IVA (16%): $${data.iva.toFixed(2)}\n`;
    ticket += this.bold(true);
    ticket += this.textSize(2, 2);
    ticket += `TOTAL: $${data.total.toFixed(2)}\n`;
    ticket += this.textSize(1, 1);
    ticket += this.bold(false);

    ticket += this.separator();

    // Método de pago
    ticket += this.align('center');
    ticket += `Pago: ${data.paymentMethod.toUpperCase()}\n`;

    // Footer
    if (data.ticketFooter) {
      ticket += this.feed(1);
      ticket += `${data.ticketFooter}\n`;
    }

    // Corte
    ticket += this.feed(3);
    ticket += this.cut();

    return ticket;
  }

  /**
   * Genera comandos ESC/POS en formato base64 para envío directo
   */
  static generateBase64Commands(data: TicketData): string {
    const commands = this.generateTicket(data);
    return Buffer.from(commands, 'binary').toString('base64');
  }
}
