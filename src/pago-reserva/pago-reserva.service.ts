import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CreatePagoReservaDto } from './dto/create-pago-reserva.dto';
import { UpdatePagoReservaDto } from './dto/update-pago-reserva.dto';
import { PrismaClient, PagoStatus, MetodoPago } from 'generated/prisma';
import { FacturaService } from '../factura/factura.service';

@Injectable()
export class PagoReservaService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger(PagoReservaService.name);

  constructor(private readonly facturaService: FacturaService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async crearPagoAutomatico(reservaId: number, monto: number) {
    try {
      const pago = await this.pagoReserva.create({
        data: {
          reservaId,
          metodoPago: MetodoPago.QR_CODE,
          monto,
          estado: PagoStatus.PENDING,
          referenciaPago: `RESERVA-${reservaId}-${Date.now()}`
        }
      });

      this.logger.log(`Pago automático creado para reserva ${reservaId}`);
      return pago;
    } catch (error) {
      this.logger.error(`Error creando pago automático: ${error.message}`);
      throw error;
    }
  }

  /**
   * Confirma un pago y genera la factura automáticamente
   */
  async confirmarPago(pagoId: number) {
    try {
      // Verificar si el pago ya fue confirmado
      const pagoExistente = await this.pagoReserva.findUnique({
        where: { id: pagoId },
        include: {
          factura: true,
          reserva: {
            include: {
              area: true
            }
          }
        }
      });

      if (!pagoExistente) {
        throw new Error(`Pago con ID ${pagoId} no encontrado`);
      }

      if (pagoExistente.estado === PagoStatus.ACCEPTED) {
        this.logger.log(`Pago ${pagoId} ya fue confirmado anteriormente`);
        return pagoExistente;
      }

      // Actualizar estado del pago
      const pagoActualizado = await this.pagoReserva.update({
        where: { id: pagoId },
        data: {
          estado: PagoStatus.ACCEPTED,
          fechaPago: new Date(),
          transaccionId: `TXN-${Date.now()}`
        },
        include: {
          reserva: {
            include: {
              area: true
            }
          },
          factura: true
        }
      });

      this.logger.log(`Pago ${pagoId} confirmado exitosamente`);

      // 🆕 ACTUALIZAR ESTADO DE LA RESERVA A CONFIRMED
      await this.reserva.update({
        where: { id: pagoActualizado.reservaId },
        data: { estado: 'CONFIRMED' }
      });

      this.logger.log(`✅ Reserva ${pagoActualizado.reservaId} actualizada a estado CONFIRMED`);

      // Generar factura automáticamente solo si no existe
      if (!pagoActualizado.factura) {
        try {
          await this.facturaService.generarFacturaBoliviana(
            pagoId,
            {
              nombre: 'Cliente General',
              email: 'cliente@citylights.com',
              documento: '0000000',
              complemento: ''
            },
            {
              nit: '1234567890123',
              razonSocial: 'CITYLIGHTS BOOKING S.R.L.',
              numeroAutorizacion: '29040011007',
              nombre: 'CITYLIGHTS',
              direccion: 'Av. Arce #2345, Edificio Torre Empresarial, Piso 15, La Paz, Bolivia',
              telefono: '+591 2 2345678',
              email: 'facturas@citylights.com',
              sucursal: 'Casa Matriz',
              municipio: 'La Paz',
              actividadEconomica: '631200 - Actividades de reserva y otras actividades conexas del turismo'
            }
          );

          this.logger.log(`Factura generada automáticamente para pago ${pagoId}`);
        } catch (facturaError) {
          this.logger.error(`Error generando factura para pago ${pagoId}: ${facturaError.message}`);
          // No fallar la confirmación del pago por error en factura
        }
      } else {
        this.logger.log(`Factura ya existe para pago ${pagoId}`);
      }

      // Retornar el pago actualizado con la factura
      return await this.pagoReserva.findUnique({
        where: { id: pagoId },
        include: {
          reserva: {
            include: {
              area: true
            }
          },
          factura: true
        }
      });

    } catch (error) {
      this.logger.error(`Error confirmando pago ${pagoId}: ${error.message}`);
      throw error;
    }
  }

  create(createPagoReservaDto: CreatePagoReservaDto) {
    return this.pagoReserva.create({ 
      data: {
        reservaId: createPagoReservaDto.reservaId,
        metodoPago: createPagoReservaDto.metodoPago as MetodoPago,
        monto: createPagoReservaDto.monto,
        estado: PagoStatus.PENDING
      }
    });
  }

  update(id: number, updatePagoReservaDto: UpdatePagoReservaDto) {
    return this.pagoReserva.update({
      where: { id },
      data: {
        monto: updatePagoReservaDto.monto,
        estado: updatePagoReservaDto.metodoPago as any
      }
    });
  }

  remove(id: number) {
    return this.pagoReserva.delete({
      where: { id }
    });
  }

  findAll() {
    return this.pagoReserva.findMany({
      include: {
        factura: true,
        reserva: {
          include: {
            area: true
          }
        }
      }
    });
  }

  findOne(id: number) {
    return this.pagoReserva.findUnique({
      where: { id },
      include: {
        factura: true,
        reserva: {
          include: {
            area: true
          }
        }
      }
    });
  }

  /**
   * Obtener pago por ID de reserva
   */
  async obtenerPorReservaId(reservaId: number) {
    return await this.pagoReserva.findFirst({
      where: { reservaId },
      include: {
        factura: true,
        reserva: {
          include: {
            area: true
          }
        }
      },
      orderBy: { fechaCreacion: 'desc' } // Obtener el más reciente si hay múltiples
    });
  }

  // 🆕 QR PAYMENT METHODS

  /**
   * Generar datos de pago QR simulado
   */
  async generarQRPago(reservaId: number, user: any) {
    console.log(`📱 [QR Service] Generando QR para reserva ${reservaId}`);
    
    try {
      // Verificar que la reserva existe
      const reserva = await this.reserva.findUnique({
        where: { id: reservaId },
        include: { area: true }
      });

      if (!reserva) {
        throw new Error(`Reserva ${reservaId} no encontrada`);
      }

      // Crear pago QR pendiente
      const pago = await this.pagoReserva.create({
        data: {
          reservaId,
          metodoPago: MetodoPago.QR_CODE,
          monto: reserva.costo,
          estado: PagoStatus.PENDING,
          usuarioId: parseInt(user.id) || null,
          usuarioNombre: user.nombre,
          codigoQr: `QR-${reservaId}-${Date.now()}`,
          urlQr: `https://qr-demo.citylights.bo/pago/${reservaId}`,
          referenciaPago: `REF-${reservaId}-${Date.now().toString().slice(-6)}`,
          transaccionId: `TXN-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        }
      });

      // Datos del QR simulado (bancos bolivianos)
      const qrData = {
        pagoId: pago.id,
        reservaId,
        monto: reserva.costo,
        codigoQr: pago.codigoQr,
        referenciaPago: pago.referenciaPago,
        transaccionId: pago.transaccionId,
        
        // Datos bancarios simulados bolivianos
        banco: 'Banco Nacional de Bolivia',
        numeroCuenta: '1001234567',
        titular: 'CITYLIGHTS SRL',
        nit: '123456789',
        
        // Instrucciones
        instrucciones: [
          '1. Escanea el código QR con tu app bancaria',
          '2. Verifica el monto y concepto',
          '3. Confirma el pago',
          '4. Usa la referencia para confirmar aquí'
        ],
        
        // QR simulado (en un caso real sería generado por el banco)
        qrImage: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="12" fill="black">QR: ${pago.codigoQr}</text></svg>`,
        
        fechaLimite: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
        estado: 'PENDING'
      };

      console.log(`✅ [QR Service] QR generado exitosamente para pago ${pago.id}`);
      return qrData;

    } catch (error) {
      console.error(`❌ [QR Service] Error generando QR:`, error.message);
      throw error;
    }
  }

  /**
   * Confirmar pago QR manualmente
   */
  async confirmarPagoQR(pagoId: number, referenciaPago: string = '', user: any) {
    console.log(`✅ [QR Service] Confirmando pago QR ${pagoId}`);
    
    try {
      // Verificar que el pago existe y está pendiente
      const pago = await this.pagoReserva.findUnique({
        where: { id: pagoId },
        include: { 
          reserva: { include: { area: true } },
          factura: true
        }
      });

      if (!pago) {
        throw new Error(`Pago ${pagoId} no encontrado`);
      }

      if (pago.estado !== PagoStatus.PENDING) {
        throw new Error(`Pago ${pagoId} ya fue procesado`);
      }

      // Generar referencia automática si no se proporciona
      const referenciaFinal = referenciaPago.trim() || pago.referenciaPago || `AUTO-QR-${Date.now()}`;
      
      // Actualizar el pago como confirmado
      const pagoActualizado = await this.pagoReserva.update({
        where: { id: pagoId },
        data: {
          estado: PagoStatus.ACCEPTED,
          fechaPago: new Date(),
          referenciaPago: referenciaFinal,
          transaccionId: pago.transaccionId || `QR-CONF-${Date.now()}`
        }
      });

      // Actualizar estado de la reserva
      await this.reserva.update({
        where: { id: pago.reservaId },
        data: { estado: 'CONFIRMED' }
      });

      // Generar factura automáticamente
      if (!pago.factura) {
        console.log(`🧾 [QR Service] Generando factura para pago QR ${pagoId}`);
        await this.confirmarPago(pagoId);
      }

      console.log(`✅ [QR Service] Pago QR ${pagoId} confirmado exitosamente`);
      
      return {
        success: true,
        pagoId,
        reservaId: pago.reservaId,
        estado: 'CONFIRMADO',
        referenciaPago: pagoActualizado.referenciaPago,
        monto: pago.monto,
        fechaConfirmacion: pagoActualizado.fechaPago,
        mensaje: 'Pago QR confirmado exitosamente'
      };

    } catch (error) {
      console.error(`❌ [QR Service] Error confirmando pago QR:`, error.message);
      throw error;
    }
  }
}
