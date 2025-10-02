import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CreateReservaDto } from './dto/create-reserva.dto';
import { UpdateReservaDto } from './dto/update-reserva.dto';
import { PrismaClient, PagoStatus, MetodoPago, EstadoReserva } from 'generated/prisma';

@Injectable()
export class ReservaService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger(ReservaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  async create(createReservaDto: CreateReservaDto) {
    // Validar que los campos requeridos estén presentes
    if (!createReservaDto.usuarioId) {
      throw new Error('usuarioId es requerido');
    }
    if (createReservaDto.costo === undefined || createReservaDto.costo === null) {
      throw new Error('costo es requerido');
    }

    // Preparar datos para Prisma - asegurándonos de que todos los campos requeridos estén presentes
    const reservaData = {
      areaId: createReservaDto.areaId,
      usuarioId: String(createReservaDto.usuarioId),
      inicio: new Date(createReservaDto.inicio),
      fin: new Date(createReservaDto.fin),
      estado: createReservaDto.estado || EstadoReserva.PENDING,
      costo: createReservaDto.costo,
      usuarioNombre: createReservaDto.usuarioNombre,
      usuarioRol: createReservaDto.usuarioRol
    };

    console.log('🔍 [Reserva Service] Datos que se enviarán a Prisma:', reservaData);

    // Crear la reserva y automáticamente generar la confirmación
    const reserva = await this.reserva.create({ 
      data: reservaData 
    });

    // Auto-generar confirmación
    const confirmacion = await this.confirmacion.create({
      data: {
        reservaId: reserva.id,
        codigoQr: `QR-${reserva.id}-${Date.now()}`, // Código QR único
        verificada: 'PENDING' // Estado inicial
      }
    });

    // Auto-generar pago-reserva
    const pago = await this.pagoReserva.create({
      data: {
        reservaId: reserva.id,
        metodoPago: MetodoPago.QR_CODE, // Por defecto QR
        monto: reserva.costo,
        estado: PagoStatus.PENDING,
        referenciaPago: `PAGO-RESERVA-${reserva.id}-${Date.now()}`
      }
    });

    this.logger.log(`Reserva ${reserva.id} creada con confirmación ${confirmacion.id} y pago ${pago.id}`);

    return {
      reserva,
      confirmacion,
      pago
    };
  }

  async findAll(user?: any) {
    console.log('📊 [Reserva Service] findAll llamado con usuario:', user);
    
    const whereCondition: any = {};
    
    // Si es USER_CASUAL, solo puede ver sus propias reservas
    if (user && user.rol === 'USER_CASUAL') {
      console.log('🔒 [Reserva Service] Filtrando para USER_CASUAL, ID:', user.id);
      whereCondition.usuarioId = String(user.id);
    } else {
      console.log('👑 [Reserva Service] Mostrando todas las reservas (ADMIN/SUPER)');
    }
    
    console.log('🔍 [Reserva Service] whereCondition:', whereCondition);
    
    const reservas = await this.reserva.findMany({
      where: whereCondition,
      include: {
        area: true,
        confirmacion: true,
        pagosReserva: true
      }
    });

    console.log('✅ [Reserva Service] Reservas encontradas:', reservas.length);
    console.log('📋 [Reserva Service] IDs de reservas encontradas:', reservas.map(r => r.id));
    return reservas;
  }

  findOne(id: number) {
    return this.reserva.findUnique({
      where: { id },
      include: {
        area: true,
        confirmacion: true,
        pagosReserva: true
      }
    });
  }

  async findOneWithFactura(id: number, user: any) {
    console.log('🔍 [BUSCAR RESERVA] Buscando reserva ID:', id, 'para usuario:', user.id);
    
    const reserva = await this.reserva.findUnique({
      where: { id },
      include: {
        area: true,
        confirmacion: true,
        pagosReserva: {
          include: {
            factura: true
          }
        }
      }
    });

    console.log('🔍 [BUSCAR RESERVA] Reserva encontrada:', !!reserva);
    
    if (!reserva) {
      throw new Error('Reserva no encontrada');
    }

    // Verificar permisos: el usuario debe ser el dueño de la reserva o ser SUPER_USER
    console.log('🔍 [PERMISOS] Verificando acceso a reserva:', {
      reservaId: id,
      reservaUsuarioId: reserva.usuarioId,
      reservaUsuarioIdType: typeof reserva.usuarioId,
      userId: user.id,
      userIdType: typeof user.id,
      userRole: user.rol,
      stringUserId: String(user.id),
      sonIguales: reserva.usuarioId === String(user.id)
    });
    
    if (reserva.usuarioId !== String(user.id) && user.rol !== 'SUPER_USER') {
      throw new Error('No tienes permisos para acceder a esta reserva');
    }

    // Buscar si existe una factura asociada a los pagos de esta reserva
    let factura: any = null;
    for (const pago of reserva.pagosReserva) {
      if (pago.factura) {
        factura = pago.factura;
        break;
      }
    }

    return {
      ...reserva,
      factura
    };
  }

  update(id: number, updateReservaDto: UpdateReservaDto) {
    return this.reserva.update({
      where: { id },
      data: updateReservaDto
    });
  }

  remove(id: number) {
    return this.reserva.delete({
      where: { id }
    });
  }

  async removeWithCascade(id: number) {
    console.log(`🗑️ [ReservaService] Iniciando eliminación en cascada para reserva ${id}`);
    
    return await this.$transaction(async (tx) => {
      // 1. Eliminar facturas asociadas (a través de pagosReserva)
      const pagosConFacturas = await tx.pagoReserva.findMany({
        where: { reservaId: id },
        include: { factura: true }
      });
      
      for (const pago of pagosConFacturas) {
        if (pago.factura) {
          console.log(`🗑️ [ReservaService] Eliminando factura ${pago.factura.id} del pago ${pago.id}`);
          await tx.factura.delete({
            where: { id: pago.factura.id }
          });
        }
      }
      
      // 2. Eliminar pagos de reserva
      const deletedPagos = await tx.pagoReserva.deleteMany({
        where: { reservaId: id }
      });
      console.log(`🗑️ [ReservaService] Eliminados ${deletedPagos.count} pagos`);
      
      // 3. Eliminar confirmación
      const deletedConfirmacion = await tx.confirmacion.deleteMany({
        where: { reservaId: id }
      });
      console.log(`🗑️ [ReservaService] Eliminadas ${deletedConfirmacion.count} confirmaciones`);
      
      // 4. Finalmente, eliminar la reserva
      const deletedReserva = await tx.reserva.delete({
        where: { id }
      });
      console.log(`✅ [ReservaService] Reserva ${id} eliminada exitosamente`);
      
      return deletedReserva;
    });
  }

  // Método para obtener reservas con datos completos para reportes
  async findAllForReports(fechaInicio?: string, fechaFin?: string) {
    const whereCondition: any = {};

    // Filtrar por fechas si se proporcionan
    if (fechaInicio && fechaFin) {
      whereCondition.inicio = {
        gte: new Date(fechaInicio),
        lte: new Date(fechaFin + 'T23:59:59.999Z')
      };
    }

    return this.reserva.findMany({
      where: whereCondition,
      include: {
        area: true,
        pagosReserva: true,
        confirmacion: true
      }
    });
  }
}