import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ReservaService } from './reserva.service';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { UpdateReservaDto } from './dto/update-reserva.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser, GetUserId, GetUserName, GetUserRole } from '../auth/user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { StripeService } from '../stripe/stripe.service';
import { PagoReservaService } from '../pago-reserva/pago-reserva.service';
import type { UserFromToken } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@Controller('reserva')
export class ReservaController {
  private readonly logger = new Logger(ReservaController.name);

  constructor(
    private readonly reservaService: ReservaService,
    private readonly auditoriaService: AuditoriaService,
    private readonly stripeService: StripeService,
    private readonly pagoReservaService: PagoReservaService
  ) {}

  // Ruta HTTP POST para crear una reserva
  @Post()
  @UseGuards(JwtAuthGuard)
  async createHttp(
    @Body() createReservaDto: CreateReservaDto,
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    // Calcular el costo automáticamente si no se proporciona
    let costo = createReservaDto.costo;
    if (!costo) {
      // Obtener el área para calcular el costo
      const area = await this.reservaService.areaComun.findUnique({
        where: { id: createReservaDto.areaId }
      });
      
      if (area) {
        const inicio = new Date(createReservaDto.inicio);
        const fin = new Date(createReservaDto.fin);
        const horas = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
        costo = area.costoHora * horas;
      } else {
        costo = 0; // valor por defecto si no se encuentra el área
      }
    }

    // Debug: Verificar qué datos están llegando del usuario autenticado
    console.log('🔍 [Reserva Controller] Usuario autenticado:', user);
    console.log('🔍 [Reserva Controller] user.nombre:', user.nombre);
    console.log('🔍 [Reserva Controller] user.rol:', user.rol);

    // Auto-llenar campos de usuario
    const reservaData = {
      ...createReservaDto,
      usuarioId: user.id.toString(),
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      costo: costo
    };

    console.log('🔍 [Reserva Controller] Datos de reserva a crear:', reservaData);

    const result = await this.reservaService.create(reservaData);

    // Registrar auditoría (wrap en try-catch para no afectar la creación de reserva)
    try {
      await this.auditoriaService.registrarAccion({
        usuarioId: user.id,
        usuarioNombre: user.nombre,
        usuarioRol: user.rol,
        accion: 'CREATE',
        tabla: 'Reserva',
        registroId: result.reserva?.id?.toString(),
        datosNuevos: reservaData,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        metodo: req.method,
      });
    } catch (auditError) {
      console.log('Error registrando auditoría:', auditError.message);
    }

    return result;
  }

  // Ruta HTTP GET para obtener todas las reservas
  @Get()
  @UseGuards(JwtAuthGuard)
  findAllHttp(@GetUser() user: UserFromToken) {
    console.log('🎭 [Reserva Controller] findAllHttp - Usuario recibido:', user);
    console.log('🎭 [Reserva Controller] findAllHttp - user.rol:', user?.rol);
    console.log('🎭 [Reserva Controller] findAllHttp - user.id:', user?.id);
    return this.reservaService.findAll(user);
  }

  // Ruta HTTP GET para buscar reserva por id
  @Get(':id')
  findOneHttp(@Param('id') id: number) {
    return this.reservaService.findOne(Number(id));
  }

  // Ruta HTTP GET para obtener reserva con factura
  @Get(':id/with-factura')
  @UseGuards(JwtAuthGuard)
  async getReservaWithFactura(@Param('id') id: number, @GetUser() user: UserFromToken) {
    return this.reservaService.findOneWithFactura(Number(id), user);
  }

  // Ruta HTTP PUT para actualizar una reserva
  @Put(':id')
  updateHttp(@Param('id') id: number, @Body() updateReservaDto: UpdateReservaDto) {
    return this.reservaService.update(Number(id), updateReservaDto);
  }

  // Ruta HTTP DELETE para eliminar una reserva
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async removeHttp(
    @Param('id') id: string,
    @GetUser() user: UserFromToken
  ) {
    try {
      this.logger.log(`🗑️ [Delete] Usuario ${user.nombre} (${user.rol}) intentando eliminar reserva ${id}`);
      
      // Validar que el ID sea un número válido
      const reservaId = parseInt(id);
      if (isNaN(reservaId)) {
        this.logger.error(`❌ [Delete] ID inválido: ${id}`);
        throw new Error(`ID de reserva inválido: ${id}`);
      }
      
      // Solo SUPER_USER puede eliminar
      if (user.rol !== 'SUPER_USER') {
        this.logger.error(`❌ [Delete] Usuario ${user.nombre} sin permisos (rol: ${user.rol})`);
        throw new Error('No tienes permisos para eliminar reservas');
      }
      
      // Verificar que la reserva existe antes de eliminar
      const reservaExistente = await this.reservaService.findOne(reservaId);
      if (!reservaExistente) {
        this.logger.error(`❌ [Delete] Reserva ${reservaId} no encontrada`);
        throw new Error(`Reserva con ID ${reservaId} no encontrada`);
      }
      
      this.logger.log(`🔍 [Delete] Reserva encontrada, procediendo a eliminar: ${reservaId}`);
      
      // Eliminar en cascada - primero las dependencias, luego la reserva
      this.logger.log(`🗑️ [Delete] Iniciando eliminación en cascada para reserva ${reservaId}`);
      const result = await this.reservaService.removeWithCascade(reservaId);
      this.logger.log(`✅ [Delete] Reserva ${reservaId} y sus dependencias eliminadas exitosamente`);
      
      return result;
    } catch (error) {
      this.logger.error(`❌ [Delete] Error eliminando reserva ${id}:`, error.message);
      throw error;
    }
  }

  // 🚀 ENDPOINT PARA REPORTES DE INGRESOS
  @Get('reportes/ingresos')
  async getReporteIngresos(
    @Param('fechaInicio') fechaInicio?: string,
    @Param('fechaFin') fechaFin?: string
  ) {
    try {
      // Obtener todas las reservas con pagos
      const reservas = await this.reservaService.findAllForReports(fechaInicio, fechaFin);
      
      // Procesar reservas para crear reporte de ingresos por área
      const ingresosPorArea = new Map();
      
      for (const reserva of reservas) {
        if (reserva.area && reserva.pagosReserva && reserva.pagosReserva.length > 0) {
          const areaNombre = reserva.area.nombre;
          // Sumar todos los pagos de la reserva
          const montoTotal = reserva.pagosReserva.reduce((sum, pago) => sum + (pago.monto || 0), 0);
          
          if (!ingresosPorArea.has(areaNombre)) {
            ingresosPorArea.set(areaNombre, {
              nombre: areaNombre,
              totalIngresos: 0,
              cantidadReservas: 0,
              ingresoPromedio: 0
            });
          }
          
          const areaData = ingresosPorArea.get(areaNombre);
          areaData.totalIngresos += montoTotal;
          areaData.cantidadReservas += 1;
          areaData.ingresoPromedio = areaData.totalIngresos / areaData.cantidadReservas;
        }
      }
      
      return Array.from(ingresosPorArea.values());
    } catch (error) {
      this.logger.error('Error generando reporte de ingresos:', error);
      return [];
    }
  }

  // 🚀 NUEVO: Crear reserva con pago Stripe
  @Post('with-stripe')
  @UseGuards(JwtAuthGuard)
  async createReservaWithStripe(
    @Body() createReservaDto: CreateReservaDto,
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    try {
      // Calcular el costo automáticamente si no se proporciona
      let costo = createReservaDto.costo;
      if (!costo) {
        const area = await this.reservaService.areaComun.findUnique({
          where: { id: createReservaDto.areaId }
        });
        
        if (area) {
          const inicio = new Date(createReservaDto.inicio);
          const fin = new Date(createReservaDto.fin);
          const horas = (fin.getTime() - inicio.getTime()) / (1000 * 60 * 60);
          costo = area.costoHora * horas;
        } else {
          costo = 0;
        }
      }

      // Auto-llenar campos de usuario
      const reservaData = {
        ...createReservaDto,
        usuarioId: user.id.toString(),
        usuarioNombre: user.nombre,
        usuarioRol: user.rol,
        costo: costo
      };

      // 1. Crear la reserva (con pago pendiente)
      const result = await this.reservaService.create(reservaData);

      // 2. El pago queda pendiente, la factura se generará cuando el usuario la solicite
      this.logger.log(`💳 Pago ${result.pago.id} creado en estado PENDING para reserva ${result.reserva.id}`);

      // 3. Obtener información del área para la descripción
      const area = await this.reservaService.areaComun.findUnique({
        where: { id: createReservaDto.areaId }
      });

      const descripcion = `Reserva de ${area?.nombre || 'Área Común'} - ${new Date(createReservaDto.inicio).toLocaleDateString()} ${new Date(createReservaDto.inicio).toLocaleTimeString()} a ${new Date(createReservaDto.fin).toLocaleTimeString()}`;

      // 4. Crear sesión de Stripe
      const session = await this.stripeService.createCheckoutSession(
        result.reserva.id,
        costo,
        descripcion,
        user.email
      );

      // 4. Registrar auditoría
      try {
        await this.auditoriaService.registrarAccion({
          usuarioId: Number(user.id),
          usuarioNombre: user.nombre,
          usuarioRol: user.rol,
          accion: 'CREATE_RESERVA_STRIPE',
          tabla: 'Reserva',
          registroId: result.reserva?.id?.toString(),
          datosNuevos: {
            ...reservaData,
            stripeSessionId: session.id
          },
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl,
          metodo: req.method,
        });
      } catch (auditError) {
        console.log('Error registrando auditoría:', auditError.message);
      }

      return {
        success: true,
        message: 'Reserva creada exitosamente. Procede al pago.',
        reserva: result.reserva,
        confirmacion: result.confirmacion,
        pago: result.pago,
        stripe: {
          sessionId: session.id,
          checkoutUrl: session.url
        }
      };

    } catch (error) {
      return {
        success: false,
        message: `Error creando reserva con Stripe: ${error.message}`
      };
    }
  }
}