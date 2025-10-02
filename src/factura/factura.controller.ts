import { Controller, Get, Post, Param, Body, Res, Headers } from '@nestjs/common';
import { FacturaService } from './factura.service';
import { CITYLIGHTS_CONFIG } from '../config/citylights.config';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('factura')
export class FacturaController {
  constructor(private readonly facturaService: FacturaService) {}

  /**
   * Genera una factura boliviana para un pago específico
   */
  @Post('generar/:pagoReservaId')
  async generarFactura(
    @Param('pagoReservaId') pagoReservaId: string,
    @Body() body: {
      datosCliente: {
        nombre: string;
        email?: string;
        documento?: string;
        complemento?: string;
      };
      datosEmpresa: {
        nit: string;
        razonSocial: string;
        numeroAutorizacion: string;
        nombre: string;
        direccion: string;
        telefono?: string;
        email?: string;
        sucursal?: string;
        municipio: string;
        actividadEconomica: string;
      };
    }
  ) {
    try {
      const factura = await this.facturaService.generarFacturaBoliviana(
        parseInt(pagoReservaId),
        body.datosCliente,
        body.datosEmpresa
      );

      return {
        success: true,
        message: 'Factura generada exitosamente',
        data: factura
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error generando factura',
        error: error.message
      };
    }
  }

  /**
   * Obtiene una factura por ID
   */
  @Get(':id')
  async obtenerFactura(@Param('id') id: string) {
    try {
      const factura = await this.facturaService.obtenerFactura(parseInt(id));
      
      if (!factura) {
        return {
          success: false,
          message: 'Factura no encontrada'
        };
      }

      return {
        success: true,
        data: factura
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error obteniendo factura',
        error: error.message
      };
    }
  }

  /**
   * Lista todas las facturas
   */
  @Get()
  async listarFacturas() {
    try {
      const facturas = await this.facturaService.listarFacturas();
      
      return {
        success: true,
        data: facturas
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error listando facturas',
        error: error.message
      };
    }
  }

  /**
   * Descarga el PDF de una factura con información del usuario del token
   */
  @Get(':id/descargar')
  async descargarFactura(
    @Param('id') id: string, 
    @Res() res: Response,
    @Body('datosUsuario') datosUsuario?: any,
    @Headers() headers?: any
  ) {
    try {
      console.log('🔍 [DESCARGA] Headers recibidos del gateway:', {
        userId: headers['x-user-id'],
        userEmail: headers['x-user-email'],
        userName: headers['x-user-name'],
        userRole: headers['x-user-role']
      });

      console.log('🔍 [DESCARGA] TODOS LOS HEADERS:', headers);

      // Extraer información del usuario de los headers
      const infoUsuario = {
        id: headers['x-user-id'] || 'N/A',
        email: headers['x-user-email'] || 'cliente@citylights.com',
        nombre: headers['x-user-name'] || 'Cliente General',
        rol: headers['x-user-role'] || 'user'
      };

      console.log('👤 [DESCARGA] Información del usuario:', infoUsuario);
      
      const factura = await this.facturaService.obtenerFactura(parseInt(id));
      
      if (!factura) {
        return res.status(404).json({
          success: false,
          message: 'Factura no encontrada'
        });
      }

      // 🔄 REGENERAR FACTURA CON INFORMACIÓN DEL USUARIO
      console.log('🔄 [DESCARGA] Regenerando factura con información del usuario...');
      const facturaActualizada = await this.facturaService.regenerarFacturaConUsuario(parseInt(id), infoUsuario);
      
      if (!facturaActualizada || !facturaActualizada.rutaPdf) {
        return res.status(500).json({
          success: false,
          message: 'Error al regenerar la factura'
        });
      }

      // Usar la factura actualizada regenerada
      const rutaPdf = facturaActualizada.rutaPdf;
      if (!rutaPdf) {
        return res.status(500).json({
          success: false,
          message: 'Error: Ruta de archivo no disponible'
        });
      }

      // Normalizar y resolver ruta absoluta
      let rutaAbsoluta: string;
      
      if (path.isAbsolute(rutaPdf)) {
        // Si ya es absoluta, usarla directamente
        rutaAbsoluta = path.normalize(rutaPdf);
      } else {
        // Si es relativa, resolverla desde el directorio actual
        rutaAbsoluta = path.resolve(rutaPdf);
      }
      
      console.log(`🔍 [DESCARGA] Factura ID: ${id}`);
      console.log(`🔍 [DESCARGA] Ruta original: ${rutaPdf}`);
      console.log(`🔍 [DESCARGA] Ruta absoluta: ${rutaAbsoluta}`);
      
      // Verificar que el archivo existe
      if (!fs.existsSync(rutaAbsoluta)) {
        console.error(`❌ [DESCARGA] Archivo no encontrado: ${rutaAbsoluta}`);
        
        // Intentar con diferentes variantes de ruta
        const rutaAlternativa1 = path.join(process.cwd(), rutaPdf);
        const rutaAlternativa2 = path.join(__dirname, '../../', rutaPdf);
        
        console.log(`🔍 [DESCARGA] Intentando ruta alternativa 1: ${rutaAlternativa1}`);
        console.log(`🔍 [DESCARGA] Intentando ruta alternativa 2: ${rutaAlternativa2}`);
        
        if (fs.existsSync(rutaAlternativa1)) {
          rutaAbsoluta = rutaAlternativa1;
          console.log(`✅ [DESCARGA] Encontrado en ruta alternativa 1`);
        } else if (fs.existsSync(rutaAlternativa2)) {
          rutaAbsoluta = rutaAlternativa2;
          console.log(`✅ [DESCARGA] Encontrado en ruta alternativa 2`);
        } else {
          return res.status(404).json({
            success: false,
            message: `Archivo no encontrado en ninguna ubicación. Probado: ${rutaAbsoluta}, ${rutaAlternativa1}, ${rutaAlternativa2}`
          });
        }
      }

      // Determinar tipo de archivo

      // Solo permitir descarga de PDF
      if (!rutaPdf.endsWith('.pdf')) {
        return res.status(400).json({
          success: false,
          message: 'Solo se permite descargar archivos PDF. Regenera la factura para obtener el PDF oficial.'
        });
      }
  // Usar el nombre real del archivo generado en la carpeta de facturas
  const nombreArchivoReal = path.basename(rutaAbsoluta);
  console.log(`📄 [DESCARGA] Sirviendo archivo PDF: ${rutaAbsoluta} como ${nombreArchivoReal}`);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivoReal}"`);

      // Esperar máximo 3 intentos rápidos para asegurar que el PDF esté listo
      let intentos = 0;
      const maxIntentos = 3;
      const esperaMs = 150;
      let pdfListo = false;
      let stats;
      while (intentos < maxIntentos) {
        try {
          stats = fs.statSync(rutaAbsoluta);
          if (stats.size > 1000) { // PDF mínimo 1KB
            pdfListo = true;
            break;
          }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, esperaMs));
        intentos++;
      }
      if (!pdfListo) {
        return res.status(500).json({
          success: false,
          message: 'El PDF no está listo para descargar. Intenta nuevamente.'
        });
      }
      // Enviar el archivo usando ruta absoluta
      return res.sendFile(rutaAbsoluta, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nombreArchivoReal}"`
        }
      });
      
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error descargando factura',
        error: error.message
      });
    }
  }

  /**
   * Generar factura automática cuando se confirma un pago
   */
  @Post('automatica/:pagoReservaId')
  async generarFacturaAutomatica(@Param('pagoReservaId') pagoReservaId: string) {
    try {
      // Datos de la empresa CITYLIGHTS desde configuración
      const datosEmpresaDefecto = {
        nit: CITYLIGHTS_CONFIG.empresa.nit,
        razonSocial: CITYLIGHTS_CONFIG.empresa.razonSocial,
        numeroAutorizacion: CITYLIGHTS_CONFIG.fiscal.numeroAutorizacion,
        nombre: CITYLIGHTS_CONFIG.empresa.nombre,
        direccion: CITYLIGHTS_CONFIG.empresa.direccion,
        telefono: CITYLIGHTS_CONFIG.empresa.telefono,
        email: CITYLIGHTS_CONFIG.empresa.email,
        sucursal: CITYLIGHTS_CONFIG.empresa.sucursal,
        municipio: CITYLIGHTS_CONFIG.empresa.municipio,
        actividadEconomica: CITYLIGHTS_CONFIG.empresa.actividadEconomica
      };

      // Datos básicos del cliente (se puede mejorar para obtener datos reales)
      const datosClienteDefecto = {
        nombre: 'Cliente General',
        email: 'cliente@email.com',
        documento: '0000000'
      };

      const factura = await this.facturaService.generarFacturaBoliviana(
        parseInt(pagoReservaId),
        datosClienteDefecto,
        datosEmpresaDefecto
      );

      return {
        success: true,
        message: 'Factura automática generada exitosamente',
        data: factura
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error generando factura automática',
        error: error.message
      };
    }
  }

  /**
   * TEMPORAL: Verificar archivos PDF en el directorio
   */
  @Get('debug/archivos-pdf')
  async verificarArchivosPDF() {
    try {
      const dirFacturas = path.join(process.cwd(), 'facturas');
      
      if (!fs.existsSync(dirFacturas)) {
        return {
          success: false,
          message: 'Directorio de facturas no existe',
          directorio: dirFacturas
        };
      }

      const archivos = fs.readdirSync(dirFacturas);
      const infoArchivos = archivos.map(archivo => {
        const rutaCompleta = path.join(dirFacturas, archivo);
        const stats = fs.statSync(rutaCompleta);
        return {
          nombre: archivo,
          tamaño: stats.size,
          fechaCreacion: stats.birthtime,
          fechaModificacion: stats.mtime
        };
      });

      return {
        success: true,
        directorio: dirFacturas,
        totalArchivos: archivos.length,
        archivos: infoArchivos
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * TEMPORAL: Probar generación de archivos
   */
  @Get('debug/test-pdf')
  async testGeneracionPDF() {
    try {
      const facturaTest = {
        id: 999,
        numeroFactura: 'TEST-001',
        clienteNombre: 'Cliente Test',
        empresaNombre: 'CITYLIGHTS TEST',
        total: 100.00
      };

      // Probar archivo de texto
      const rutaTexto = await this.facturaService.generarArchivoTexto(facturaTest, null);
      
      // Probar PDF mínimo
      const rutaPDFMinimo = await this.facturaService.generarPDFMinimo(facturaTest);
      
      return {
        success: true,
        message: 'Archivos de prueba generados',
        archivos: {
          texto: rutaTexto,
          pdfMinimo: rutaPDFMinimo
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        error: error.stack
      };
    }
  }

  /**
   * TEMPORAL: Descargar archivo específico para prueba
   */
  @Get('debug/descargar/:nombreArchivo')
  async descargarArchivoPrueba(@Param('nombreArchivo') nombreArchivo: string, @Res() res: Response) {
    try {
      const dirFacturas = path.join(process.cwd(), 'facturas');
      const rutaArchivo = path.join(dirFacturas, nombreArchivo);
      
      console.log('🔍 [DEBUG-DESCARGA] Intentando descargar:', rutaArchivo);
      
      if (!fs.existsSync(rutaArchivo)) {
        return res.status(404).json({
          success: false,
          message: 'Archivo no encontrado'
        });
      }

      const stats = fs.statSync(rutaArchivo);
      console.log('📊 [DEBUG-DESCARGA] Tamaño del archivo:', stats.size, 'bytes');

      // Leer el contenido del archivo
      const contenido = fs.readFileSync(rutaArchivo);
      console.log('📋 [DEBUG-DESCARGA] Primeros 20 bytes:', contenido.slice(0, 20).toString('hex'));
      
      // Configurar headers para descarga
      const esTexto = nombreArchivo.endsWith('.txt');
      const contentType = esTexto ? 'text/plain' : 'application/pdf';
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Length', stats.size);

      console.log('📤 [DEBUG-DESCARGA] Enviando archivo...');
      res.send(contenido);

    } catch (error) {
      console.error('❌ [DEBUG-DESCARGA] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * DEBUG: Ver información de todas las facturas
   */
  @Get('debug/info-facturas')
  async verInfoFacturas() {
    try {
      const facturas = await this.facturaService['factura'].findMany({
        orderBy: { fechaEmision: 'desc' }
      });
      
      const infoFacturas = facturas.map(factura => {
        const rutaAbsoluta = factura.rutaPdf ? path.resolve(factura.rutaPdf) : null;
        return {
          id: factura.id,
          numeroFactura: factura.numeroFactura,
          rutaPdf: factura.rutaPdf,
          rutaAbsoluta: rutaAbsoluta,
          archivoExiste: rutaAbsoluta ? fs.existsSync(rutaAbsoluta) : false,
          fechaEmision: factura.fechaEmision,
          estado: factura.estado
        };
      });

      return {
        success: true,
        totalFacturas: facturas.length,
        facturas: infoFacturas
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Regenerar PDF de una factura existente
   */
  @Post(':id/regenerar-pdf')
  async regenerarPDF(@Param('id') id: string) {
    try {
      const factura = await this.facturaService.obtenerFactura(parseInt(id));
      
      if (!factura) {
        return {
          success: false,
          message: 'Factura no encontrada'
        };
      }

      // Regenerar solo el PDF usando los datos existentes de la factura
      const qrFiscal = await this.facturaService.generarQRFiscal(factura);
      const rutaPdf = await this.facturaService.generarPDFFactura(factura, factura.pagoReserva, qrFiscal);
      
      // Actualizar la ruta del PDF en la base de datos
      const facturaActualizada = await this.facturaService.factura.update({
        where: { id: parseInt(id) },
        data: {
          rutaPdf: rutaPdf,
          estado: 'ENVIADA'
        }
      });

      return {
        success: true,
        message: 'PDF regenerado exitosamente',
        data: {
          facturaId: facturaActualizada.id,
          numeroFactura: facturaActualizada.numeroFactura,
          rutaPdf: facturaActualizada.rutaPdf,
          estado: facturaActualizada.estado
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error regenerando PDF',
        error: error.message
      };
    }
  }

  /**
   * PRUEBA: Verificar funcionamiento de Puppeteer
   */
  @Get('debug/test-puppeteer')
  async testPuppeteer(@Res() res: Response) {
    try {
      console.log('🧪 [TEST-PUPPETEER] Iniciando prueba de Puppeteer...');
      
      const facturaPrueba = {
        numeroFactura: 'TEST-PUPPETEER-001',
        clienteNombre: 'Cliente de Prueba',
        empresaNit: '1234567890123',
        total: 100
      };

      const rutaPdf = await this.facturaService.generarPDFUltraSimple(facturaPrueba, null);
      
      console.log('✅ [TEST-PUPPETEER] PDF generado:', rutaPdf);
      
      if (fs.existsSync(rutaPdf)) {
        const stats = fs.statSync(rutaPdf);
        
        // Leer los primeros bytes para verificar el header
        const buffer = fs.readFileSync(rutaPdf);
        const headerBytes = buffer.slice(0, 20);
        
        res.json({
          success: true,
          message: 'PDF de prueba generado exitosamente con Puppeteer',
          archivo: path.basename(rutaPdf),
          tamaño: stats.size,
          ruta: rutaPdf,
          headerHex: headerBytes.toString('hex'),
          headerText: headerBytes.toString('ascii'),
          esValidoPDF: buffer.slice(0, 4).toString() === '%PDF'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'PDF generado pero archivo no encontrado'
        });
      }

    } catch (error) {
      console.error('❌ [TEST-PUPPETEER] Error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message,
        stack: error.stack
      });
    }
  }
}