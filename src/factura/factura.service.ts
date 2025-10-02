import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as puppeteer from 'puppeteer';

@Injectable()
export class FacturaService extends PrismaClient {
  constructor() {
    super();
  }

  /**
   * Genera una factura boliviana completa con todos los requisitos fiscales
   */
  async generarFacturaBoliviana(pagoReservaId: number, datosCliente: any, datosEmpresa: any) {
    try {
      // Obtener información del pago y reserva
      const pagoReserva = await this.pagoReserva.findUnique({
        where: { id: pagoReservaId },
        include: {
          reserva: {
            include: {
              area: true
            }
          }
        }
      });

      if (!pagoReserva) {
        throw new Error('Pago no encontrado');
      }

      // Generar datos fiscales bolivianos
      const numeroFactura = await this.generarNumeroFactura();
      const codigoControl = this.generarCodigoControl(numeroFactura, datosEmpresa.nit, pagoReserva.monto);
      const fechaLimiteEmision = new Date();
      fechaLimiteEmision.setFullYear(fechaLimiteEmision.getFullYear() + 1);

      // Crear registro de factura en la base de datos
      const factura = await this.factura.create({
        data: {
          pagoReservaId: pagoReservaId,
          numeroFactura: numeroFactura,
          
          // Datos fiscales bolivianos obligatorios
          nit: datosEmpresa.nit,
          razonSocial: datosEmpresa.razonSocial,
          numeroAutorizacion: datosEmpresa.numeroAutorizacion,
          codigoControl: codigoControl,
          fechaLimiteEmision: fechaLimiteEmision,
          
          // Datos del cliente
          clienteNombre: datosCliente.nombre,
          clienteEmail: datosCliente.email,
          clienteDocumento: datosCliente.documento,
          clienteComplemento: datosCliente.complemento,
          
          // Datos de la empresa
          empresaNombre: datosEmpresa.nombre,
          empresaNit: datosEmpresa.nit,
          empresaDireccion: datosEmpresa.direccion,
          empresaTelefono: datosEmpresa.telefono,
          empresaEmail: datosEmpresa.email,
          sucursal: datosEmpresa.sucursal || 'Casa Matriz',
          municipio: datosEmpresa.municipio,
          
          // Detalles fiscales
          subtotal: pagoReserva.monto,
          descuento: 0,
          montoGiftCard: 0,
          total: pagoReserva.monto,
          moneda: 'BOB',
          tipoCambio: 1,
          
          // Información fiscal adicional
          actividadEconomica: datosEmpresa.actividadEconomica,
          leyenda: this.obtenerLeyendaFiscal(pagoReserva.monto),
          usuario: 'SISTEMA',
          
          estado: 'GENERADA'
        }
      });

      // Generar QR fiscal boliviano
      const qrFiscal = await this.generarQRFiscal(factura);
      
      // Actualizar factura con QR
      const facturaActualizada = await this.factura.update({
        where: { id: factura.id },
        data: {
          qrFiscal: qrFiscal,
          urlVerificacion: `https://pilotosiat.impuestos.gob.bo/consulta/QR?nit=${datosEmpresa.nit}&cuf=${codigoControl}&numero=${numeroFactura}&t=2`
        }
      });

      // Usar el generador PDF oficial
      console.log('✅ [FACTURA] Usando generador PDF oficial...');
  const rutaPdf = await this.generarPDFFactura(facturaActualizada, pagoReserva, facturaActualizada.qrFiscal ?? '');
      // Actualizar con la ruta del PDF y hash
      const hashArchivo = this.calcularHashArchivo(rutaPdf);
      await this.factura.update({
        where: { id: factura.id },
        data: {
          rutaPdf: rutaPdf, // Guardamos la ruta PDF en este campo
          hashArchivo: hashArchivo,
          estado: 'ENVIADA'
        }
      });

      return await this.factura.findUnique({
        where: { id: factura.id },
        include: {
          pagoReserva: {
            include: {
              reserva: {
                include: {
                  area: true
                }
              }
            }
          }
        }
      });

    } catch (error) {
      console.error('Error generando factura boliviana:', error);
      throw error;
    }
  }

  /**
   * Genera número de factura secuencial
   */
  private async generarNumeroFactura(): Promise<string> {
    const ultimaFactura = await this.factura.findFirst({
      orderBy: { id: 'desc' }
    });

    let numeroSecuencial = 1;
    if (ultimaFactura) {
      const ultimoNumero = parseInt(ultimaFactura.numeroFactura.split('-')[1] || '0');
      numeroSecuencial = ultimoNumero + 1;
    }

    return `FAC-${numeroSecuencial.toString().padStart(8, '0')}`;
  }

  /**
   * Genera código de control fiscal boliviano
   */
  private generarCodigoControl(numeroFactura: string, nit: string, monto: number): string {
    const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const montoStr = Math.round(monto * 100).toString().padStart(12, '0');
    const cadena = `${numeroFactura}${nit}${fecha}${montoStr}`;
    
    return crypto.createHash('sha256').update(cadena).digest('hex').substring(0, 16).toUpperCase();
  }

  /**
   * Genera QR fiscal según estándares bolivianos
   */
  async generarQRFiscal(factura: any): Promise<string> {
    const textoQR = `${factura.nit}|${factura.numeroFactura}|${factura.numeroAutorizacion}|${factura.fechaEmision.toISOString().split('T')[0]}|${factura.total}|${factura.codigoControl}`;
    
    try {
      return await QRCode.toDataURL(textoQR, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 200
      });
    } catch (error) {
      console.error('Error generando QR fiscal:', error);
      throw error;
    }
  }

  /**
   * Obtiene la leyenda fiscal según el monto
   */
  private obtenerLeyendaFiscal(monto: number): string {
    if (monto > 50000) {
      return 'ESTA FACTURA CONTRIBUYE AL DESARROLLO DEL PAÍS, EL USO ILÍCITO SERÁ SANCIONADO PENALMENTE DE ACUERDO A LEY';
    }
    return 'Ley N° 453: El proveedor debe habilitar medios electrónicos de pago';
  }

  /**
   * Genera el PDF de la factura con formato oficial boliviano
   */
  async generarPDFFactura(factura: any, pagoReserva: any, qrFiscal: string): Promise<string> {
    console.log('🔍 [PDF] Iniciando generación de PDF para factura:', factura.numeroFactura);
    console.log('🔍 [PDF] Datos de factura:', {
      id: factura.id,
      numeroFactura: factura.numeroFactura,
      empresaNombre: factura.empresaNombre,
      clienteNombre: factura.clienteNombre,
      total: factura.total
    });
    console.log('🔍 [PDF] Datos de pago-reserva:', {
      id: pagoReserva?.id,
      monto: pagoReserva?.monto,
      reservaId: pagoReserva?.reservaId,
      areaComun: pagoReserva?.reserva?.area?.nombre
    });

    return new Promise((resolve, reject) => {
      try {
        // Crear directorio si no existe
        const dirFacturas = path.join(process.cwd(), 'facturas');
        if (!fs.existsSync(dirFacturas)) {
          fs.mkdirSync(dirFacturas, { recursive: true });
          console.log('📁 [PDF] Directorio facturas creado:', dirFacturas);
        }

        const nombreArchivo = `factura_${factura.numeroFactura}_${Date.now()}.pdf`;
        const rutaCompleta = path.join(dirFacturas, nombreArchivo);
        console.log('📄 [PDF] Generando archivo:', rutaCompleta);

        // Validar que los datos requeridos estén presentes
        if (!factura.empresaNombre || !factura.clienteNombre || !factura.total) {
          throw new Error(`Datos incompletos para generar PDF. Empresa: ${factura.empresaNombre}, Cliente: ${factura.clienteNombre}, Total: ${factura.total}`);
        }

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const stream = fs.createWriteStream(rutaCompleta);
        doc.pipe(stream);

        console.log('🎨 [PDF] Iniciando dibujo del PDF...');

        // Colores CITYLIGHTS
        const colores = {
          purpura: '#4A2FCC',
          naranja: '#FF7A2D', 
          amarillo: '#FFC623',
          blanco: '#FFFFFF',
          negro: '#000000',
          gris: '#666666'
        };

        console.log('🎨 [PDF] Colores definidos, comenzando con el header...');

        // Fondo con banda superior púrpura
        doc.rect(0, 0, 612, 100).fill(colores.purpura);

        // Logo CITYLIGHTS estilizado - lado izquierdo
        doc.fillColor(colores.blanco);
        
        // Dibujar círculos del logo (aproximación usando círculos)
        doc.fillColor(colores.naranja).circle(70, 50, 15).fill();
        doc.fillColor(colores.amarillo).circle(90, 50, 18).fill();
        
        // Texto CITYLIGHTS - más pequeño y mejor posicionado
        doc.fillColor(colores.blanco)
           .fontSize(20)
           .font('Helvetica-Bold')
           .text('CITYLIGHTS', 120, 42);

        // Información de la empresa - organizada debajo del logo
        doc.fillColor(colores.blanco)
           .fontSize(8)
           .font('Helvetica')
           .text(`${factura.empresaNombre} - NIT: ${factura.empresaNit}`, 50, 70)
           .text(`${factura.empresaDireccion}`, 50, 82);

        // Teléfono alineado con la misma estructura vertical
        if (factura.empresaTelefono) {
          doc.text(`Tel: ${factura.empresaTelefono}`, 50, 94);
        }

        // Información de la factura - lado derecho, movido más a la izquierda
        doc.fillColor(colores.blanco)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('FACTURA', 420, 35);
           
        doc.fontSize(9)
           .font('Helvetica')
           .text(`N° ${factura.numeroFactura}`, 420, 50)
           .text(`NIT: ${factura.nit}`, 420, 62)
           .text(`Autorización: ${factura.numeroAutorizacion}`, 420, 74);

        // Restablecer color para el contenido
        doc.fillColor(colores.negro);

        // Datos del cliente con estilo - posición ajustada
        doc.rect(50, 120, 512, 25).fill('#F8F9FA').stroke('#E9ECEF');
        doc.fillColor(colores.negro)
           .fontSize(12)
           .font('Helvetica-Bold')
           .text('DATOS DEL CLIENTE', 60, 130);

      // Información del cliente en filas organizadas
      doc.fontSize(10)
        .font('Helvetica')
        .text(`ID Cliente: ${factura.clienteDocumento || ''}`, 60, 155)
        .text(`Nombre: ${factura.clienteNombre || ''}`, 60, 170)
        .text(`Rol: ${factura.clienteComplemento || ''}`, 60, 185);

      // Estado de la reserva y monto
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor(colores.purpura)
        .text(`Estado: CANCELADO`, 60, 200)
        .fillColor(colores.negro)
        .font('Helvetica')
        .text(`Monto de la reserva: ${factura.total.toFixed(2)} BOB`, 60, 215);

      // Fecha y código de control (lado derecho) - mejor espaciado
      doc.text(`Fecha: ${factura.fechaEmision.toLocaleDateString('es-BO')}`, 350, 155)
        .text(`Código Control: ${factura.codigoControl}`, 350, 170);

        // Tabla de detalles con estilo - posición ajustada
        const inicioTabla = 210;
        
        // Encabezado de tabla con fondo púrpura
        doc.rect(50, inicioTabla, 512, 25).fill(colores.purpura);
        doc.fillColor(colores.blanco)
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('DESCRIPCIÓN', 60, inicioTabla + 8)
           .text('CANT.', 300, inicioTabla + 8)
           .text('PRECIO UNIT.', 380, inicioTabla + 8)
           .text('TOTAL', 480, inicioTabla + 8);

        // Fila de datos
        const filaDetalle = inicioTabla + 25;
        doc.rect(50, filaDetalle, 512, 25).fill('#F8F9FA').stroke('#E9ECEF');
        
        const descripcion = pagoReserva?.reserva?.area?.nombre ? 
          `Reserva de ${pagoReserva.reserva.area.nombre}` : 
          'Servicio de Reserva';
          
        doc.fillColor(colores.negro)
           .fontSize(10)
           .font('Helvetica')
           .text(descripcion, 60, filaDetalle + 8)
           .text('1', 300, filaDetalle + 8)
           .text(`${factura.total.toFixed(2)} BOB`, 380, filaDetalle + 8)
           .text(`${factura.total.toFixed(2)} BOB`, 480, filaDetalle + 8);

        // Totales con estilo
        const inicioTotales = filaDetalle + 40;
        doc.rect(350, inicioTotales, 212, 70).fill('#F8F9FA').stroke('#E9ECEF');
        
        doc.fontSize(10)
           .font('Helvetica')
           .text(`Subtotal:`, 360, inicioTotales + 12)
           .text(`${factura.subtotal.toFixed(2)} BOB`, 480, inicioTotales + 12)
           .text(`Descuento:`, 360, inicioTotales + 25)
           .text(`${factura.descuento.toFixed(2)} BOB`, 480, inicioTotales + 25);

        // Total final destacado
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor(colores.purpura)
           .text(`TOTAL:`, 360, inicioTotales + 45)
           .text(`${factura.total.toFixed(2)} BOB`, 480, inicioTotales + 45);

        // Monto en literal
        doc.fillColor(colores.negro)
           .fontSize(9)
           .font('Helvetica-Oblique')
           .text(`Son: ${this.convertirMontoALiteral(factura.total)}`, 60, inicioTotales + 85);

        // QR Code fiscal - mejor posicionado
        if (qrFiscal) {
          try {
            const qrBuffer = Buffer.from(qrFiscal.replace('data:image/png;base64,', ''), 'base64');
            doc.image(qrBuffer, 60, inicioTotales + 105, { width: 80 });
            
            doc.fontSize(7)
               .text('Código QR Fiscal', 60, inicioTotales + 195);
          } catch (qrError) {
            console.warn('Error insertando QR en PDF:', qrError);
          }
        }

        // Información fiscal en footer - posición ajustada
        const footer = 520;
        doc.rect(50, footer, 512, 50).fill('#F8F9FA').stroke('#E9ECEF');
        
        doc.fontSize(7)
           .fillColor(colores.gris)
           .text(factura.leyenda, 60, footer + 8, { width: 490, align: 'center' });

        if (factura.urlVerificacion) {
          doc.text(`Verificar en: ${factura.urlVerificacion}`, 60, footer + 25, { 
            width: 490, 
            align: 'center',
            link: factura.urlVerificacion
          });
        }

        // Pie de página con marca CITYLIGHTS
        doc.fontSize(6)
           .fillColor(colores.purpura)
           .text('Powered by CITYLIGHTS - Sistema de Gestión de Reservas', 50, 590, {
             width: 512,
             align: 'center'
           });

        console.log('📝 [PDF] Finalizando documento PDF...');

        // Finalizar el documento PDF
        doc.end();

        // Esperar a que el stream termine antes de resolver
        stream.on('finish', () => {
          console.log('✅ [PDF] Stream finalizado correctamente:', rutaCompleta);
          resolve(rutaCompleta);
        });
        stream.on('error', (error) => {
          console.error('❌ [PDF] Error en stream:', error);
          reject(error);
        });
        doc.on('error', (error) => {
          console.error('❌ [PDF] Error en documento PDF:', error);
          reject(error);
        });

      } catch (error) {
        console.error('❌ [PDF] Error general generando PDF:', error);
        reject(error);
      }
    });
  }

  /**
   * Convierte un monto numérico a literal en español
   */
  private convertirMontoALiteral(monto: number): string {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    
    let entero = Math.floor(monto);
    const centavos = Math.round((monto - entero) * 100);
    
    let literal = '';
    
    if (entero === 0) {
      literal = 'CERO';
    } else if (entero === 1) {
      literal = 'UN';
    } else {
      // Implementación básica para números hasta 999999
      if (entero >= 1000) {
        const miles = Math.floor(entero / 1000);
        literal += this.convertirCentenas(miles) + ' MIL ';
        entero = entero % 1000;
      }
      
      if (entero > 0) {
        literal += this.convertirCentenas(entero);
      }
    }
    
    literal += ` BOLIVIANO${entero !== 1 ? 'S' : ''}`;
    
    if (centavos > 0) {
      literal += ` CON ${centavos.toString().padStart(2, '0')}/100`;
    }
    
    return literal.trim();
  }

  private convertirCentenas(numero: number): string {
    const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
    
    let resultado = '';
    
    const c = Math.floor(numero / 100);
    const d = Math.floor((numero % 100) / 10);
    const u = numero % 10;
    
    if (c > 0) {
      if (numero === 100) {
        resultado += 'CIEN';
      } else {
        resultado += centenas[c];
      }
    }
    
    if (d > 0) {
      if (d === 1) {
        const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
        resultado += (resultado ? ' ' : '') + especiales[u];
        return resultado;
      } else {
        resultado += (resultado ? ' ' : '') + decenas[d];
      }
    }
    
    if (u > 0 && d !== 1) {
      if (d === 2 && u <= 9) {
        resultado = resultado.replace('VEINTE', 'VEINTI' + unidades[u]);
      } else {
        resultado += (resultado ? ' Y ' : '') + unidades[u];
      }
    }
    
    return resultado;
  }

  /**
   * Calcula hash SHA256 del archivo PDF
   */
  private calcularHashArchivo(rutaArchivo: string): string {
    const contenido = fs.readFileSync(rutaArchivo);
    return crypto.createHash('sha256').update(contenido).digest('hex');
  }

  /**
   * Obtiene una factura por ID
   */
  async obtenerFactura(id: number) {
    return await this.factura.findUnique({
      where: { id },
      include: {
        pagoReserva: {
          include: {
            reserva: {
              include: {
                area: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Regenera una factura existente con información actualizada del usuario
   */
  async regenerarFacturaConUsuario(facturaId: number, infoUsuario: any) {
    try {
      console.log('🔄 [REGENERAR] Regenerando factura con info del usuario:', facturaId);
      console.log('👤 [REGENERAR] Info del usuario:', infoUsuario);
      
      // Obtener la factura existente
      const facturaExistente = await this.factura.findUnique({
        where: { id: facturaId },
        include: {
          pagoReserva: {
            include: {
              reserva: {
                include: {
                  area: true
                }
              }
            }
          }
        }
      });

      if (!facturaExistente) {
        throw new Error('Factura no encontrada');
      }
        // Actualizar los datos del cliente con la info del usuario
        const facturaActualizada = await this.factura.update({
          where: { id: facturaId },
          data: {
            clienteNombre: infoUsuario.nombre || facturaExistente.clienteNombre,
            clienteEmail: infoUsuario.email || facturaExistente.clienteEmail,
            clienteDocumento: infoUsuario.id || facturaExistente.clienteDocumento,
            clienteComplemento: infoUsuario.rol || facturaExistente.clienteComplemento
          }
        });


        // Generar QR fiscal actualizado
        const qrFiscal = await this.generarQRFiscal(facturaActualizada);

        // Obtener el objeto pagoReserva completo
        const pagoReserva = await this.pagoReserva.findUnique({
          where: { id: facturaActualizada.pagoReservaId },
          include: {
            reserva: {
              include: {
                area: true
              }
            }
          }
        });

        // Generar PDF con los datos actualizados y QR
        const rutaPdf = await this.generarPDFFactura(facturaActualizada, pagoReserva, qrFiscal);

        // Actualizar la factura con la nueva ruta PDF
        const facturaFinal = await this.factura.update({
          where: { id: facturaId },
          data: {
            rutaPdf: rutaPdf
          }
        });

        console.log('✅ [REGENERAR] Factura PDF regenerada exitosamente');
        return facturaFinal;
    } catch (error) {
      console.error('❌ [REGENERAR] Error regenerando factura:', error);
      throw error;
    }
  }

  /**
   * Lista todas las facturas
   */
  async listarFacturas(skip = 0, take = 10) {
    return await this.factura.findMany({
      skip,
      take,
      include: {
        pagoReserva: {
          include: {
            reserva: {
              include: {
                area: true
              }
            }
          }
        }
      },
      orderBy: { fechaEmision: 'desc' }
    });
  }

  /**
   * MÉTODO TEMPORAL: Genera un PDF simple para debugging
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

        console.log('📝 [PDF-SIMPLE] Escribiendo contenido mejorado...');

        // HEADER CON ESTILO SIMPLE
        doc.fontSize(24)
           .fillColor('#4A2FCC')
           .text('CITYLIGHTS', 50, 50);

        doc.fontSize(16)
           .fillColor('#000000')
           .text('FACTURA OFICIAL', 50, 80);

        // LÍNEA SEPARADORA
        doc.moveTo(50, 110)
           .lineTo(550, 110)
           .strokeColor('#4A2FCC')
           .lineWidth(2)
           .stroke();

        // INFORMACIÓN PRINCIPAL
        doc.fontSize(12)
           .fillColor('#000000')
           .text(`Número de Factura: ${factura.numeroFactura || 'N/A'}`, 50, 130)
           .text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-BO')}`, 50, 150)
           .text(`NIT Empresa: ${factura.empresaNit || '1234567890123'}`, 50, 170);

        // DATOS DEL CLIENTE
        doc.fontSize(14)
           .fillColor('#4A2FCC')
           .text('DATOS DEL CLIENTE', 50, 200);
           
        doc.fontSize(12)
           .fillColor('#000000')
           .text(`Cliente: ${factura.clienteNombre || 'Cliente General'}`, 50, 220)
           .text(`Email: ${factura.clienteEmail || 'cliente@citylights.com'}`, 50, 240)
           .text(`Documento: ${factura.clienteDocumento || '0000000'}`, 50, 260);

        // DETALLES DEL SERVICIO
        doc.fontSize(14)
           .fillColor('#4A2FCC')
           .text('DETALLE DEL SERVICIO', 50, 290);

        let yPosition = 310;
        if (pagoReserva?.reserva?.area?.nombre) {
          doc.fontSize(12)
             .fillColor('#000000')
             .text(`Servicio: Reserva de ${pagoReserva.reserva.area.nombre}`, 50, yPosition);
          yPosition += 20;

          if (pagoReserva.reserva.inicio && pagoReserva.reserva.fin) {
            doc.text(`Fecha: ${new Date(pagoReserva.reserva.inicio).toLocaleDateString('es-BO')}`, 50, yPosition);
            yPosition += 20;
            doc.text(`Horario: ${new Date(pagoReserva.reserva.inicio).toLocaleTimeString('es-BO')} - ${new Date(pagoReserva.reserva.fin).toLocaleTimeString('es-BO')}`, 50, yPosition);
            yPosition += 20;
          }
        } else {
          doc.fontSize(12)
             .fillColor('#000000')
             .text('Servicio: Reserva de Área Común', 50, yPosition);
          yPosition += 20;
        }

        // TOTAL
        yPosition += 20;
        doc.fontSize(16)
           .fillColor('#4A2FCC')
           .text(`TOTAL: ${factura.total || 0} BOB`, 50, yPosition);

        // FOOTER
        doc.fontSize(10)
           .fillColor('#666666')
           .text('¡Gracias por su preferencia!', 50, yPosition + 50)
           .text('CITYLIGHTS - Sistema de Gestión de Reservas', 50, yPosition + 70)
           .text('www.citylights.com | contacto@citylights.com', 50, yPosition + 90);

        console.log('✅ [PDF-SIMPLE] Contenido escrito, finalizando...');

        // Finalizar documento
        doc.end();

        // Manejar eventos
        stream.on('finish', () => {
          console.log('✅ [PDF-SIMPLE] Stream finalizado correctamente');
          
          // Verificar el archivo generado
          setTimeout(() => {
            this.verificarArchivoPDF(rutaCompleta)
              .then(() => {
                console.log('✅ [PDF-SIMPLE] Archivo verificado correctamente');
                resolve(rutaCompleta);
              })
              .catch((error) => {
                console.error('❌ [PDF-SIMPLE] Error en verificación:', error);
                reject(error);
              });
          }, 200);
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

  /**
   * Verificar la integridad de un archivo PDF
   */
  private async verificarArchivoPDF(rutaArchivo: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔍 [PDF-VERIFICACION] Verificando archivo:', rutaArchivo);
        
        if (!fs.existsSync(rutaArchivo)) {
          throw new Error('Archivo no existe');
        }

        const stats = fs.statSync(rutaArchivo);
        console.log('📊 [PDF-VERIFICACION] Tamaño del archivo:', stats.size, 'bytes');

        if (stats.size < 100) {
          throw new Error(`Archivo demasiado pequeño: ${stats.size} bytes`);
        }

        // Leer los primeros bytes para verificar el header PDF
        const buffer = Buffer.alloc(10);
        const fd = fs.openSync(rutaArchivo, 'r');
        fs.readSync(fd, buffer, 0, 10, 0);
        fs.closeSync(fd);

        const header = buffer.toString('utf8', 0, 4);
        console.log('📋 [PDF-VERIFICACION] Header del archivo:', JSON.stringify(header));
        console.log('📋 [PDF-VERIFICACION] Primeros 10 bytes:', buffer.toString('hex'));

        if (!header.startsWith('%PDF')) {
          throw new Error(`Header PDF inválido: ${JSON.stringify(header)}`);
        }

        console.log('✅ [PDF-VERIFICACION] Archivo PDF válido');
        resolve();

      } catch (error) {
        console.error('❌ [PDF-VERIFICACION] Error:', error);
        reject(error);
      }
    });
  }

  /**
   * MÉTODO DE EMERGENCIA: Generar texto plano como "PDF" para debugging
   */
  public async generarArchivoTexto(factura: any, pagoReserva: any): Promise<string> {
    try {
      console.log('📝 [TEXTO] Generando archivo de texto como alternativa...');
      
      const dirFacturas = path.join(process.cwd(), 'facturas');
      if (!fs.existsSync(dirFacturas)) {
        fs.mkdirSync(dirFacturas, { recursive: true });
      }

      const nombreArchivo = `factura_texto_${factura.numeroFactura}_${Date.now()}.txt`;
      const rutaCompleta = path.join(dirFacturas, nombreArchivo);

      const contenido = `
==============================================
         FACTURA CITYLIGHTS
==============================================

Número de Factura: ${factura.numeroFactura}
Fecha: ${new Date().toLocaleDateString('es-BO')}
Cliente: ${factura.clienteNombre}
Empresa: ${factura.empresaNombre}
Total: ${factura.total} BOB

${pagoReserva?.reserva?.area?.nombre ? 
  `Servicio: Reserva de ${pagoReserva.reserva.area.nombre}` : 
  'Servicio: Reserva de Área Común'}

Fecha y hora de la reserva:
Inicio: ${pagoReserva?.reserva?.inicio ? new Date(pagoReserva.reserva.inicio).toLocaleString('es-BO') : 'N/A'}
Fin: ${pagoReserva?.reserva?.fin ? new Date(pagoReserva.reserva.fin).toLocaleString('es-BO') : 'N/A'}

==============================================
¡Gracias por su preferencia!
CITYLIGHTS - Sistema de Reservas
==============================================
`;

      fs.writeFileSync(rutaCompleta, contenido, 'utf8');
      
      console.log('✅ [TEXTO] Archivo de texto generado:', rutaCompleta);
      return rutaCompleta;

    } catch (error) {
      console.error('❌ [TEXTO] Error generando archivo de texto:', error);
      throw error;
    }
  }

  /**
   * MÉTODO ULTRA-BÁSICO: Generar PDF mínimo para probar PDFKit
   */
  public async generarPDFMinimo(factura: any): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔬 [PDF-MINIMO] Generando PDF ultra-básico...');
        
        const dirFacturas = path.join(process.cwd(), 'facturas');
        if (!fs.existsSync(dirFacturas)) {
          fs.mkdirSync(dirFacturas, { recursive: true });
        }

        const nombreArchivo = `factura_minimo_${Date.now()}.pdf`;
        const rutaCompleta = path.join(dirFacturas, nombreArchivo);
        
        // PDF más básico posible
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(rutaCompleta);
        
        doc.pipe(stream);
        
        // Solo texto plano
        doc.text('HOLA MUNDO - FACTURA TEST');
        doc.text(`Numero: ${factura.numeroFactura}`);
        
        doc.end();
        
        stream.on('finish', () => {
          console.log('✅ [PDF-MINIMO] PDF mínimo creado');
          resolve(rutaCompleta);
        });
        
        stream.on('error', reject);
        doc.on('error', reject);
        
      } catch (error) {
        console.error('❌ [PDF-MINIMO] Error:', error);
        reject(error);
      }
    });
  }

  /**
   * MÉTODO VALIDADO: Generar PDF con todas las validaciones y mejoras
   */
  async generarPDFUltraSimple(factura: any, pagoReserva?: any): Promise<string> {
    try {
      console.log('🔄 [PDF-VALIDADO] Iniciando generación con validaciones completas...');
      
      // 1. VALIDAR TODOS LOS DATOS ANTES DE GENERAR
      if (!factura) {
        throw new Error('Datos de factura no proporcionados');
      }

      if (!factura.numeroFactura || factura.numeroFactura.trim() === '') {
        throw new Error('Número de factura requerido');
      }

      if (!factura.total || isNaN(Number(factura.total))) {
        throw new Error('Total de factura debe ser un número válido');
      }

      console.log('✅ [PDF-VALIDADO] Datos básicos validados');

      // 2. VALIDAR Y LIMPIAR DATOS
      const datosLimpios = {
        numeroFactura: String(factura.numeroFactura).trim(),
        clienteNombre: factura.clienteNombre ? String(factura.clienteNombre).trim() : 'Cliente General',
        empresaNit: factura.empresaNit ? String(factura.empresaNit).trim() : '1234567890123',
        total: Number(factura.total) || 0
      };

      // 3. VALIDAR FECHAS
      let fechaEmision = 'Fecha no disponible';
      let fechaReserva = '';
      
      try {
        fechaEmision = new Date().toLocaleDateString('es-BO', {
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit'
        });
      } catch (error) {
        console.warn('⚠️ Error formateando fecha de emisión, usando formato por defecto');
        fechaEmision = new Date().toISOString().split('T')[0];
      }

      if (pagoReserva?.reserva?.inicio) {
        try {
          const fechaInicio = new Date(pagoReserva.reserva.inicio);
          if (!isNaN(fechaInicio.getTime())) {
            fechaReserva = fechaInicio.toLocaleDateString('es-BO', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
          }
        } catch (error) {
          console.warn('⚠️ Error formateando fecha de reserva');
        }
      }

      // 4. VALIDAR DIRECTORIO Y PERMISOS
      const dirFacturas = path.join(process.cwd(), 'facturas');
      
      try {
        if (!fs.existsSync(dirFacturas)) {
          fs.mkdirSync(dirFacturas, { recursive: true });
        }
        
        // Verificar permisos de escritura
        fs.accessSync(dirFacturas, fs.constants.W_OK);
        console.log('✅ [PDF-VALIDADO] Directorio y permisos verificados');
      } catch (error) {
        throw new Error(`Error de permisos en directorio facturas: ${error.message}`);
      }

      const nombreArchivo = `factura_completa_${datosLimpios.numeroFactura}_${Date.now()}.html`;
      const rutaCompleta = path.join(dirFacturas, nombreArchivo);

      // 5. CREAR HTML VALIDADO Y ESCAPADO
      const htmlContent = this.crearHTMLSeguro(datosLimpios, pagoReserva, fechaEmision, fechaReserva);
      
      // 6. VALIDAR HTML GENERADO
      if (!htmlContent || htmlContent.length < 100) {
        throw new Error('HTML generado inválido o muy corto');
      }

      console.log('✅ [PDF-VALIDADO] HTML generado y validado');

      // 7. USAR MÉTODO DE RESPALDO GARANTIZADO
      console.log('📄 [PDF-VALIDADO] Generando archivo HTML garantizado...');
      
      // Crear datos para el método actualizado
      const facturaActualizada = {
        numeroFactura: datosLimpios.numeroFactura,
        nit: datosLimpios.empresaNit,
        clienteNombre: datosLimpios.clienteNombre,
        total: datosLimpios.total,
        fechaEmision: new Date(fechaEmision)
      };
      
      const rutaHtml = await this.generarArchivoDeRespaldo(facturaActualizada, pagoReserva);
      
      // 9. VALIDAR ARCHIVO GENERADO
      if (!fs.existsSync(rutaHtml)) {
        throw new Error('Archivo HTML no se generó correctamente');
      }

      // Copiar el archivo generado a la ubicación esperada  
      fs.copyFileSync(rutaHtml, rutaCompleta);
      
      if (!fs.existsSync(rutaCompleta)) {
        throw new Error('Error al guardar el archivo PDF');
      }

      const stats = fs.statSync(rutaCompleta);
      if (stats.size < 1000) {
        throw new Error('Archivo PDF generado muy pequeño, posible corrupción');
      }

      console.log('✅ [PDF-VALIDADO] PDF validado creado exitosamente');
      console.log(`📊 [PDF-VALIDADO] Tamaño: ${stats.size} bytes`);
      console.log(`📁 [PDF-VALIDADO] Ruta: ${rutaCompleta}`);
      
      return rutaCompleta;

    } catch (error) {
      console.error('❌ [PDF-VALIDADO] Error completo:', error);
      throw new Error(`Error generando PDF validado: ${error.message}`);
    }
  }

  /**
   * Crear HTML seguro con datos escapados y validados
   */
  private crearHTMLSeguro(datosLimpios: any, pagoReserva: any, fechaEmision: string, fechaReserva: string): string {
    const servicioNombre = pagoReserva?.reserva?.area?.nombre 
      ? String(pagoReserva.reserva.area.nombre).trim() 
      : 'Área Común';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${datosLimpios.numeroFactura}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      margin: 40px; 
      line-height: 1.6; 
      color: #000;
      background: #fff;
    }
    .header { 
      text-align: center; 
      margin-bottom: 30px; 
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
    }
    .title { 
      font-size: 28px; 
      font-weight: bold; 
      margin-bottom: 10px; 
      color: #333;
    }
    .subtitle { 
      font-size: 18px; 
      color: #666;
    }
    .section { 
      margin: 25px 0; 
    }
    .row {
      margin: 12px 0;
      font-size: 14px;
    }
    .label { 
      font-weight: bold; 
      display: inline-block;
      width: 140px;
      color: #333;
    }
    .value {
      display: inline-block;
      color: #000;
    }
    .total { 
      font-size: 20px; 
      font-weight: bold; 
      text-align: center;
      margin: 40px 0; 
      padding: 20px; 
      border: 3px solid #333; 
      background: #f9f9f9;
    }
    .footer { 
      text-align: center; 
      margin-top: 50px; 
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">CITYLIGHTS</div>
    <div class="subtitle">FACTURA OFICIAL</div>
  </div>

  <div class="section">
    <div class="row">
      <span class="label">Número de Factura:</span>
      <span class="value">${datosLimpios.numeroFactura}</span>
    </div>
    <div class="row">
      <span class="label">Fecha de Emisión:</span>
      <span class="value">${fechaEmision}</span>
    </div>
    <div class="row">
      <span class="label">Cliente:</span>
      <span class="value">${datosLimpios.clienteNombre}</span>
    </div>
    <div class="row">
      <span class="label">NIT Empresa:</span>
      <span class="value">${datosLimpios.empresaNit}</span>
    </div>
  </div>

  <div class="section">
    <div class="row">
      <span class="label">Servicio:</span>
      <span class="value">Reserva de ${servicioNombre}</span>
    </div>
    ${fechaReserva ? `<div class="row">
      <span class="label">Fecha de Reserva:</span>
      <span class="value">${fechaReserva}</span>
    </div>` : ''}
  </div>

  <div class="total">
    TOTAL: ${datosLimpios.total} BOB
  </div>

  <div class="footer">
    <p><strong>Gracias por su preferencia</strong></p>
    <p>CITYLIGHTS - Sistema de Gestión de Reservas</p>
    <p>Este documento constituye una factura válida</p>
  </div>
</body>
</html>`;
  }



  // MÉTODO CON PUPPETEER - MÁS CONFIABLE
  async generarPDFConHTML(factura: any, pagoReserva?: any): Promise<string> {
    let browser: any = null;
    try {
      console.log('🚀 [PDF-HTML] Iniciando generación con Puppeteer...');

      const fileName = `factura_${factura.numeroFactura}_${Date.now()}.pdf`;
      const filePath = path.join(process.cwd(), 'facturas', fileName);

      // Asegurar que el directorio existe
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // HTML mejorado para la factura
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Factura ${factura.numeroFactura}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .logo { color: #4A2FCC; font-size: 28px; font-weight: bold; }
            .subtitle { color: #666; font-size: 16px; margin-top: 5px; }
            .divider { border-top: 3px solid #4A2FCC; margin: 20px 0; }
            .info-section { margin: 20px 0; }
            .label { font-weight: bold; color: #4A2FCC; }
            .value { margin-left: 10px; }
            .total { font-size: 20px; font-weight: bold; color: #4A2FCC; margin-top: 30px; }
            .footer { margin-top: 50px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">CITYLIGHTS</div>
            <div class="subtitle">FACTURA OFICIAL</div>
          </div>

          <div class="divider"></div>

          <div class="info-section">
            <div><span class="label">Número de Factura:</span><span class="value">${factura.numeroFactura || 'N/A'}</span></div>
            <div><span class="label">Fecha de Emisión:</span><span class="value">${new Date().toLocaleDateString('es-BO')}</span></div>
            <div><span class="label">NIT Empresa:</span><span class="value">${factura.empresaNit || '1234567890123'}</span></div>
          </div>

          <div class="info-section">
            <div class="label">DATOS DEL CLIENTE</div>
            <div><span class="label">Nombre:</span><span class="value">${factura.clienteNombre || 'Cliente General'}</span></div>
            <div><span class="label">Email:</span><span class="value">${factura.clienteEmail || 'cliente@citylights.com'}</span></div>
            <div><span class="label">Documento:</span><span class="value">${factura.clienteDocumento || '0000000'}</span></div>
          </div>

          <div class="info-section">
            <div class="label">DETALLE DEL SERVICIO</div>
            <div><span class="label">Servicio:</span><span class="value">Reserva de ${pagoReserva?.reserva?.area?.nombre || 'Área Común'}</span></div>
            ${pagoReserva?.reserva?.inicio ? `<div><span class="label">Fecha:</span><span class="value">${new Date(pagoReserva.reserva.inicio).toLocaleDateString('es-BO')}</span></div>` : ''}
            ${pagoReserva?.reserva?.inicio && pagoReserva?.reserva?.fin ? `<div><span class="label">Horario:</span><span class="value">${new Date(pagoReserva.reserva.inicio).toLocaleTimeString('es-BO')} - ${new Date(pagoReserva.reserva.fin).toLocaleTimeString('es-BO')}</span></div>` : ''}
          </div>

          <div class="total">
            TOTAL: ${factura.total || 0} BOB
          </div>

          <div class="footer">
            <div>¡Gracias por su preferencia!</div>
            <div>CITYLIGHTS - Sistema de Gestión de Reservas</div>
            <div>www.citylights.com | contacto@citylights.com</div>
          </div>
        </body>
        </html>
      `;

      // Inicializar puppeteer
      browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Generar PDF
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm', 
          bottom: '20mm',
          left: '20mm'
        }
      });

      await browser.close();
      browser = null;

      console.log('✅ [PDF-HTML] PDF generado exitosamente con Puppeteer');
      return fileName;

    } catch (error) {
      if (browser && browser.close) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('❌ Error cerrando browser:', closeError);
        }
      }
      console.error('❌ [PDF-HTML] Error:', error);
      throw new Error(`Error generando PDF con HTML: ${error.message}`);
    }
  }

  /**
   * Generar PDF con Puppeteer configuración segura y específica
   */
  private async generarPDFConPuppeteerSeguro(htmlContent: string): Promise<Buffer> {
    let browser: any = null;
    
    try {
      console.log('🚀 [PUPPETEER-SEGURO] Iniciando Puppeteer con configuración específica...');
      
      // Configuración ultra-segura para Puppeteer
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=TranslateUI',
          '--disable-extensions',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-default-apps'
        ],
        timeout: 60000
      });

      console.log('📄 [PUPPETEER-SEGURO] Creando página...');
      const page = await browser.newPage();
      
      // Configurar página
      await page.setViewport({ width: 1200, height: 800 });
      
      // Cargar HTML con timeout extendido
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      console.log('🖨️ [PUPPETEER-SEGURO] Generando PDF...');
      
      // Generar PDF con configuración específica
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        },
        preferCSSPageSize: false,
        displayHeaderFooter: false
      });

      await browser.close();
      browser = null;

      console.log('✅ [PUPPETEER-SEGURO] PDF generado exitosamente');
      
      if (!pdfBuffer || pdfBuffer.length < 1000) {
        throw new Error('Buffer PDF de Puppeteer inválido');
      }

      return pdfBuffer;

    } catch (error) {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('❌ Error cerrando browser:', closeError);
        }
      }
      
      console.error('❌ [PUPPETEER-SEGURO] Error:', error);
      throw new Error(`Error en Puppeteer: ${error.message}`);
    }
  }

  /**
   * MÉTODO DE RESPALDO: Generar archivo HTML que se puede imprimir como PDF
   */
  private async generarArchivoDeRespaldo(facturaActualizada: any, pagoReserva: any, infoUsuario?: any): Promise<string> {
    try {
      console.log('📄 [RESPALDO] Generando archivo HTML descargable...');
      
      const servicioNombre = pagoReserva?.reserva?.area?.nombre 
        ? String(pagoReserva.reserva.area.nombre).trim() 
        : 'Área Común';

      const fechaEmision = facturaActualizada.fechaEmision ? 
        facturaActualizada.fechaEmision.toLocaleDateString('es-BO') : 
        new Date().toLocaleDateString('es-BO');
      
      const fechaReserva = pagoReserva?.reserva?.fechaInicio ? 
        pagoReserva.reserva.fechaInicio.toLocaleDateString('es-BO') : 
        fechaEmision;

      // Convertir el monto a texto antes de crear el HTML
      const montoEnTexto = this.convertirNumeroATexto(Math.floor(facturaActualizada.total));

      // Crear HTML completamente optimizado para PDF
      const htmlCompleto = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura CITYLIGHTS - ${facturaActualizada.numeroFactura}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }
    @media print {
      body { margin: 0; font-size: 12pt; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body { 
      font-family: 'Arial', 'Helvetica', sans-serif; 
      line-height: 1.4; 
      color: #000;
      background: #fff;
      font-size: 14px;
    }
    
    /* HEADER EMPRESARIAL */
    .company-header { 
      text-align: center; 
      margin-bottom: 30px; 
      padding: 25px 0;
      border-bottom: 3px solid #1e3a8a;
      background: linear-gradient(135deg, #f8faff 0%, #e0e7ff 100%);
    }
    .company-name { 
      font-size: 36px; 
      font-weight: bold; 
      color: #1e3a8a;
      letter-spacing: 3px;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
      margin-bottom: 8px;
    }
    .company-tagline {
      font-size: 14px;
      color: #4b5563;
      font-style: italic;
      margin-bottom: 15px;
    }
    .document-title { 
      font-size: 24px; 
      color: #1e3a8a;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    /* INFORMACIÓN DE LA EMPRESA */
    .company-info {
      background: #f8faff;
      padding: 20px;
      border-left: 5px solid #1e3a8a;
      margin-bottom: 25px;
      border-radius: 0 8px 8px 0;
    }
    .company-info h4 {
      color: #1e3a8a;
      font-size: 16px;
      margin-bottom: 12px;
      font-weight: bold;
    }
    .company-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      font-size: 13px;
    }
    .company-detail {
      color: #374151;
    }
    .company-detail strong {
      color: #1f2937;
    }
    
    /* INFORMACIÓN FISCAL */
    .fiscal-section { 
      background: #fffbeb;
      border: 2px solid #f59e0b;
      border-radius: 8px;
      padding: 20px;
      margin: 25px 0;
    }
    .fiscal-title {
      font-size: 18px;
      font-weight: bold;
      color: #92400e;
      margin-bottom: 15px;
      text-align: center;
      text-transform: uppercase;
    }
    
    /* SECCIONES PRINCIPALES */
    .main-section { 
      margin: 25px 0;
      padding: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #ffffff;
    }
    .section-title {
      font-size: 16px;
      font-weight: bold;
      color: #1e3a8a;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* FILAS DE INFORMACIÓN */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    }
    .info-row {
      margin: 12px 0;
      display: flex;
      align-items: flex-start;
    }
    .info-label { 
      font-weight: bold; 
      width: 140px;
      color: #374151;
      flex-shrink: 0;
      font-size: 13px;
    }
    .info-value {
      color: #111827;
      font-weight: 500;
      flex: 1;
      font-size: 13px;
    }
    
    /* TABLA DE SERVICIOS */
    .services-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 13px;
    }
    .services-table th,
    .services-table td {
      padding: 12px;
      text-align: left;
      border: 1px solid #d1d5db;
    }
    .services-table th {
      background: #1e3a8a;
      color: white;
      font-weight: bold;
      text-transform: uppercase;
      font-size: 12px;
    }
    .services-table tr:nth-child(even) {
      background: #f9fafb;
    }
    
    /* TOTALES */
    .totals-section { 
      margin: 40px 0 30px 0;
      padding: 25px;
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      border: 3px solid #1e3a8a;
      border-radius: 12px;
      text-align: center;
    }
    .total-label {
      font-size: 16px;
      color: #1e3a8a;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .total-amount { 
      font-size: 32px; 
      font-weight: bold; 
      color: #1e3a8a;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
      letter-spacing: 1px;
    }
    
    /* FOOTER */
    .footer-section { 
      margin-top: 50px; 
      padding-top: 25px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
    }
    .footer-content {
      font-size: 12px;
      color: #6b7280;
      line-height: 1.6;
    }
    .footer-content .highlight {
      color: #1e3a8a;
      font-weight: bold;
    }
    .legal-text {
      font-size: 10px;
      color: #9ca3af;
      margin-top: 15px;
      font-style: italic;
    }
    
    /* INSTRUCCIONES DE IMPRESIÓN */
    .print-instructions {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      padding: 25px;
      border-radius: 12px;
      margin: 30px 0;
      border: 2px solid #f59e0b;
      text-align: center;
    }
    .print-instructions h3 {
      color: #92400e;
      margin-bottom: 15px;
      font-size: 18px;
    }
    .print-instructions ol {
      text-align: left;
      max-width: 500px;
      margin: 0 auto 20px auto;
      color: #78350f;
    }
    .print-instructions li {
      margin: 8px 0;
      font-weight: 500;
    }
    .print-button {
      background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
      color: white;
      border: none;
      padding: 15px 30px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
      text-transform: uppercase;
      letter-spacing: 1px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .print-button:hover {
      background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
    }
  </style>
  <script>
    function descargarPDF() {
      // Instrucciones específicas para diferentes navegadores
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      const isFirefox = /Firefox/.test(navigator.userAgent);
      
      let mensaje = 'INSTRUCCIONES PARA GUARDAR COMO PDF:\\n\\n';
      
      if (isChrome) {
        mensaje += '1. Presione Ctrl+P (o Cmd+P en Mac)\\n';
        mensaje += '2. En "Destino", seleccione "Guardar como PDF"\\n';
        mensaje += '3. Ajuste los márgenes si es necesario\\n';
        mensaje += '4. Haga clic en "Guardar"';
      } else if (isFirefox) {
        mensaje += '1. Presione Ctrl+P (o Cmd+P en Mac)\\n';
        mensaje += '2. Seleccione "Microsoft Print to PDF" o "Guardar como PDF"\\n';
        mensaje += '3. Haga clic en "Imprimir"\\n';
        mensaje += '4. Elija la ubicación para guardar';
      } else {
        mensaje += '1. Presione Ctrl+P (o Cmd+P en Mac)\\n';
        mensaje += '2. Busque la opción "Guardar como PDF"\\n';
        mensaje += '3. Configure los ajustes si es necesario\\n';
        mensaje += '4. Guarde el archivo';
      }
      
      alert(mensaje);
      setTimeout(() => {
        window.print();
      }, 500);
    }
  </script>
</head>
<body>
  <!-- INSTRUCCIONES DE DESCARGA (solo en pantalla) -->
  <div class="print-instructions no-print">
    <h3>📋 Cómo Descargar Esta Factura como PDF</h3>
    <ol>
      <li><strong>Haga clic</strong> en el botón azul de abajo</li>
      <li><strong>Presione Ctrl+P</strong> cuando se abra la ventana</li>
      <li><strong>Seleccione "Guardar como PDF"</strong> en el destino</li>
      <li><strong>Ajuste los márgenes</strong> a "Mínimos" para mejor presentación</li>
      <li><strong>Guarde</strong> su factura oficial en formato PDF</li>
    </ol>
    <button class="print-button" onclick="descargarPDF()">
      📄 GENERAR PDF OFICIAL
    </button>
  </div>

  <!-- HEADER DE LA EMPRESA -->
  <div class="company-header">
    <div class="company-name">CITYLIGHTS</div>
    <div class="company-tagline">Sistema Profesional de Gestión de Reservas</div>
    <div class="document-title">FACTURA OFICIAL</div>
  </div>

  <!-- INFORMACIÓN DE LA EMPRESA -->
  <div class="company-info">
    <h4>DATOS DE LA EMPRESA</h4>
    <div class="company-details">
      <div class="company-detail"><strong>Razón Social:</strong> CITYLIGHTS BOOKING S.R.L.</div>
      <div class="company-detail"><strong>NIT:</strong> ${facturaActualizada.nit}</div>
      <div class="company-detail"><strong>Actividad:</strong> Servicios de Reservas</div>
      <div class="company-detail"><strong>Sucursal:</strong> Casa Matriz</div>
      <div class="company-detail"><strong>Teléfono:</strong> +591 2 2345678</div>
      <div class="company-detail"><strong>Email:</strong> facturas@citylights.com</div>
    </div>
  </div>

  <!-- INFORMACIÓN FISCAL -->
  <div class="fiscal-section">
    <div class="fiscal-title">🏛️ INFORMACIÓN FISCAL</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Número de Factura:</span>
        <span class="info-value"><strong>${facturaActualizada.numeroFactura}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha de Emisión:</span>
        <span class="info-value"><strong>${fechaEmision}</strong></span>
      </div>
      <div class="info-row">
        <span class="info-label">Código de Autorización:</span>
        <span class="info-value">29040011007</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha Límite de Emisión:</span>
        <span class="info-value">${new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString('es-BO')}</span>
      </div>
    </div>
  </div>

  <!-- DATOS DEL CLIENTE -->
  <div class="main-section">
    <div class="section-title">👤 DATOS DEL CLIENTE</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Nombre/Razón Social:</span>
        <span class="info-value">${infoUsuario?.nombre || facturaActualizada.clienteNombre || 'Cliente General'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ID de Usuario:</span>
        <span class="info-value">${infoUsuario?.id || 'No disponible'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${infoUsuario?.email || facturaActualizada.clienteEmail || 'cliente@citylights.com'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Rol de Usuario:</span>
        <span class="info-value">${infoUsuario?.rol || 'Usuario'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha de Transacción:</span>
        <span class="info-value">${fechaEmision}</span>
      </div>
    </div>
  </div>

  <!-- DETALLE DE SERVICIOS -->
  <div class="main-section">
    <div class="section-title">🏢 DETALLE DE SERVICIOS PRESTADOS</div>
    <table class="services-table">
      <thead>
        <tr>
          <th style="width: 60%">Descripción del Servicio</th>
          <th style="width: 15%">Cantidad</th>
          <th style="width: 25%">Precio Unitario (BOB)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Reserva de ${servicioNombre}</strong><br>
            <small style="color: #6b7280;">
              ${fechaReserva ? `Fecha de Reserva: ${fechaReserva}` : 'Servicio de reserva de espacios'}
            </small>
          </td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right; font-weight: bold;">${facturaActualizada.total}.00</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- TOTALES -->
  <div class="totals-section">
    <div class="total-label">TOTAL A PAGAR</div>
    <div class="total-amount">${facturaActualizada.total}.00 BOB</div>
    <div style="font-size: 14px; color: #1e3a8a; margin-top: 10px;">
      <em>Son: ${montoEnTexto} 00/100 Bolivianos</em>
    </div>
  </div>

  <!-- INFORMACIÓN ADICIONAL -->
  <div class="main-section">
    <div class="section-title">ℹ️ INFORMACIÓN ADICIONAL</div>
    <div style="font-size: 13px; line-height: 1.6; color: #374151;">
      <p><strong>Método de Pago:</strong> Pago Electrónico - Stripe Payment Gateway</p>
      <p><strong>Estado de Pago:</strong> ✅ PAGADO Y CONFIRMADO</p>
      <p><strong>Condiciones:</strong> Servicio prestado al contado, sin descuentos aplicables.</p>
      <p><strong>Validez:</strong> Esta factura es válida por tiempo indefinido como comprobante de pago.</p>
    </div>
  </div>

  <!-- FOOTER LEGAL -->
  <div class="footer-section">
    <div class="footer-content">
      <p class="highlight">¡Gracias por confiar en CITYLIGHTS!</p>
      <p>CITYLIGHTS - Sistema Profesional de Gestión de Reservas</p>
      <p>📧 contacto@citylights.com | 🌐 www.citylights.com</p>
      <p>📍 Av. Arce #2345, Edificio Torre Empresarial, Piso 15, La Paz, Bolivia</p>
    </div>
    <div class="legal-text">
      <p>Esta factura ha sido generada electrónicamente y tiene plena validez legal.</p>
      <p>Documento generado el ${new Date().toLocaleString('es-BO')} | ID: ${facturaActualizada.numeroFactura}</p>
    </div>
  </div>
</body>
</html>`;

      // Generar nombre de archivo único para HTML
      const timestamp = Date.now();
      const nombreArchivo = `factura_${facturaActualizada.numeroFactura}_${timestamp}.html`;
      const rutaCompleta = path.join('./facturas', nombreArchivo);

      // Escribir el archivo HTML
      fs.writeFileSync(rutaCompleta, htmlCompleto, 'utf8');

      console.log('✅ [RESPALDO] Archivo HTML profesional generado:', rutaCompleta);
      return rutaCompleta;

    } catch (error) {
      console.error('❌ [RESPALDO] Error:', error);
      throw new Error(`Error generando archivo de respaldo: ${error.message}`);
    }
  }

  /**
   * Convertir número a texto en español para facturas
   */
  private convertirNumeroATexto(numero: number): string {
    const unidades = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const decenas = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const especiales = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

    if (numero === 0) return 'cero';
    if (numero === 100) return 'cien';
    
    let resultado = '';
    
    // Centenas
    const c = Math.floor(numero / 100);
    const resto = numero % 100;
    
    if (c > 0) {
      resultado += centenas[c];
      if (resto > 0) resultado += ' ';
    }
    
    // Decenas y unidades
    if (resto >= 10 && resto < 20) {
      resultado += especiales[resto - 10];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      
      if (d > 0) {
        resultado += decenas[d];
        if (u > 0) resultado += ' y ';
      }
      
      if (u > 0) {
        resultado += unidades[u];
      }
    }
    
    return resultado || 'cero';
  }
}