import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FacturaSimpleService extends PrismaClient {
  constructor() {
    super();
  }

  /**
   * Genera un PDF simple para probar la funcionalidad básica
   */
  async generarPDFSimple(factura: any, pagoReserva: any): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🧪 [PDF-SIMPLE] Iniciando generación de PDF simple...');
        
        // Crear directorio si no existe
        const dirFacturas = path.join(process.cwd(), 'facturas');
        if (!fs.existsSync(dirFacturas)) {
          fs.mkdirSync(dirFacturas, { recursive: true });
        }

        const nombreArchivo = `factura_simple_${factura.numeroFactura}_${Date.now()}.pdf`;
        const rutaCompleta = path.join(dirFacturas, nombreArchivo);
        
        console.log('📁 [PDF-SIMPLE] Archivo a crear:', rutaCompleta);

        // Crear documento PDF
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50
        });

        // Crear stream de escritura
        const stream = fs.createWriteStream(rutaCompleta);
        doc.pipe(stream);

        console.log('📝 [PDF-SIMPLE] Escribiendo contenido básico...');

        // Contenido simple
        doc.fontSize(20)
           .text('FACTURA CITYLIGHTS', 50, 50);

        doc.fontSize(12)
           .text(`Número: ${factura.numeroFactura}`, 50, 100)
           .text(`Fecha: ${new Date().toLocaleDateString()}`, 50, 120)
           .text(`Cliente: ${factura.clienteNombre}`, 50, 140)
           .text(`Empresa: ${factura.empresaNombre}`, 50, 160)
           .text(`Total: ${factura.total} BOB`, 50, 180);

        if (pagoReserva?.reserva?.area?.nombre) {
          doc.text(`Servicio: ${pagoReserva.reserva.area.nombre}`, 50, 200);
        }

        doc.text('¡Gracias por su preferencia!', 50, 250);

        console.log('✅ [PDF-SIMPLE] Contenido escrito, finalizando...');

        // Finalizar documento
        doc.end();

        // Manejar eventos
        stream.on('finish', () => {
          console.log('✅ [PDF-SIMPLE] Stream finalizado correctamente');
          resolve(rutaCompleta);
        });

        stream.on('error', (error) => {
          console.error('❌ [PDF-SIMPLE] Error en stream:', error);
          reject(error);
        });

        doc.on('error', (error) => {
          console.error('❌ [PDF-SIMPLE] Error en documento:', error);
          reject(error);
        });

      } catch (error) {
        console.error('❌ [PDF-SIMPLE] Error general:', error);
        reject(error);
      }
    });
  }
}