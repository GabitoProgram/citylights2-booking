import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { PagoReservaService } from './pago-reserva.service';
import { CreatePagoReservaDto } from './dto/create-pago-reserva.dto';
import { UpdatePagoReservaDto } from './dto/update-pago-reserva.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UserFromToken } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('pago-reserva')
export class PagoReservaController {
  constructor(
    private readonly pagoReservaService: PagoReservaService,
    private readonly auditoriaService: AuditoriaService
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createPagoReservaDto: CreatePagoReservaDto,
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    // Auto-llenar campos de usuario
    const pagoData = {
      ...createPagoReservaDto,
      usuarioId: user.id,
      usuarioNombre: user.nombre
    };

    const result = await this.pagoReservaService.create(pagoData);

    // Registrar auditoría
    await this.auditoriaService.registrarAccion({
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      accion: 'CREATE',
      tabla: 'PagoReserva',
      registroId: result.id?.toString(),
      datosNuevos: pagoData,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      metodo: req.method,
    });

    return result;
  }

  @Post('automatico/:reservaId/:monto')
  crearPagoAutomatico(@Param('reservaId') reservaId: string, @Param('monto') monto: string) {
    return this.pagoReservaService.crearPagoAutomatico(+reservaId, +monto);
  }

  /**
   * Confirma un pago y genera la factura automáticamente
   */
  @Post('confirmar/:id')
  @UseGuards(JwtAuthGuard)
  async confirmarPago(
    @Param('id') id: string,
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    try {
      const pagoConfirmado = await this.pagoReservaService.confirmarPago(+id);

      // Registrar auditoría
      await this.auditoriaService.registrarAccion({
        usuarioId: user.id,
        usuarioNombre: user.nombre,
        usuarioRol: user.rol,
        accion: 'UPDATE',
        tabla: 'PagoReserva',
        registroId: id,
        datosNuevos: { estado: 'ACCEPTED', fechaPago: new Date() },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        metodo: req.method,
      });

      return {
        success: true,
        message: 'Pago confirmado y factura generada exitosamente',
        data: pagoConfirmado
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error confirmando pago',
        error: error.message
      };
    }
  }

  @Get()
  findAll() {
    return this.pagoReservaService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const pago = await this.pagoReservaService.findOne(+id);
      return {
        success: true,
        data: pago
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error obteniendo pago',
        error: error.message
      };
    }
  }

  /**
   * Consulta el estado completo de un pago con su factura
   */
  @Get(':id/estado')
  async consultarEstadoPago(@Param('id') id: string) {
    try {
      const pago = await this.pagoReservaService.pagoReserva.findUnique({
        where: { id: parseInt(id) },
        include: {
          reserva: {
            include: {
              area: true
            }
          },
          factura: true
        }
      });

      if (!pago) {
        return {
          success: false,
          message: 'Pago no encontrado'
        };
      }

      return {
        success: true,
        data: {
          pago: {
            id: pago.id,
            estado: pago.estado,
            monto: pago.monto,
            metodoPago: pago.metodoPago,
            fechaCreacion: pago.fechaCreacion,
            fechaPago: pago.fechaPago,
            transaccionId: pago.transaccionId
          },
          reserva: pago.reserva,
          factura: pago.factura ? {
            id: pago.factura.id,
            numeroFactura: pago.factura.numeroFactura,
            estado: pago.factura.estado,
            total: pago.factura.total,
            fechaEmision: pago.factura.fechaEmision,
            rutaPdf: pago.factura.rutaPdf,
            tieneArchivo: pago.factura.rutaPdf ? true : false
          } : null
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error consultando estado del pago',
        error: error.message
      };
    }
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePagoReservaDto: UpdatePagoReservaDto) {
    return this.pagoReservaService.update(+id, updatePagoReservaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pagoReservaService.remove(+id);
  }

  // 🆕 QR PAYMENT ENDPOINTS

  /**
   * POST /api/pago-reserva/qr/generar/:reservaId
   * Generar QR para pago de reserva
   */
  @Post('qr/generar/:reservaId')
  @UseGuards(JwtAuthGuard)
  async generarQRPago(
    @Param('reservaId') reservaId: string,
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    console.log(`📱 [QR] Generando QR para reserva ${reservaId} por usuario ${user.nombre}`);
    console.log('🌐 [QR] Flujo: Frontend → Gateway → Microservicio');
    
    const result = await this.pagoReservaService.generarQRPago(+reservaId, user);

    // Registrar auditoría
    await this.auditoriaService.registrarAccion({
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      accion: 'QR_GENERATE',
      tabla: 'PagoReserva',
      registroId: reservaId,
      datosNuevos: { qrGenerado: true },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      metodo: req.method,
    });

    return result;
  }

  /**
   * POST /api/pago-reserva/qr/confirmar/:pagoId
   * Confirmar pago QR manualmente
   */
  @Post('qr/confirmar/:pagoId')
  @UseGuards(JwtAuthGuard)
  async confirmarPagoQR(
    @Param('pagoId') pagoId: string,
    @Body() confirmData: { referenciaPago?: string } = { referenciaPago: undefined },
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    console.log(`✅ [QR] Confirmando pago QR ${pagoId} por usuario ${user.nombre}`);
    console.log('🌐 [QR] Flujo: Frontend → Gateway → Microservicio');
    
    const result = await this.pagoReservaService.confirmarPagoQR(+pagoId, confirmData.referenciaPago || '', user);

    // Registrar auditoría
    await this.auditoriaService.registrarAccion({
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      accion: 'QR_CONFIRM',
      tabla: 'PagoReserva',
      registroId: pagoId,
      datosNuevos: { 
        referenciaPago: confirmData.referenciaPago,
        confirmadoPor: user.nombre 
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      metodo: req.method,
    });

    return result;
  }
}
