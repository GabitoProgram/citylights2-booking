import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class AuditoriaService extends PrismaClient implements OnModuleInit {
  
  async onModuleInit() {
    await this.$connect();
    console.log('[AuditoriaService] Connected to the database');
  }

  // Método para registrar auditoría manual cuando sea necesario
  async registrarAccion(datos: {
    usuarioId?: number;
    usuarioNombre?: string;
    usuarioRol?: string;
    accion: string;
    tabla: string;
    registroId?: string;
    datosAnteriores?: any;
    datosNuevos?: any;
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    metodo?: string;
  }) {
    try {
      await this.auditoriaLog.create({
        data: {
          usuarioId: datos.usuarioId ? parseInt(datos.usuarioId.toString()) : null,
          usuarioNombre: datos.usuarioNombre || 'Sistema',
          usuarioRol: datos.usuarioRol || 'SYSTEM',
          accion: datos.accion,
          tabla: datos.tabla,
          registroId: datos.registroId || null,
          datosAnteriores: datos.datosAnteriores || null,
          datosNuevos: datos.datosNuevos || null,
          ip: datos.ip || null,
          userAgent: datos.userAgent || null,
          endpoint: datos.endpoint || null,
          metodo: datos.metodo || null,
        }
      });
    } catch (error) {
      console.error('Error registrando auditoría:', error);
    }
  }

  // Método para obtener logs de auditoría
  async obtenerLogs(filtros?: {
    usuarioId?: number;
    tabla?: string;
    accion?: string;
    fechaDesde?: Date;
    fechaHasta?: Date;
    limite?: number;
  }) {
    const where: any = {};
    
    if (filtros?.usuarioId) where.usuarioId = filtros.usuarioId;
    if (filtros?.tabla) where.tabla = filtros.tabla;
    if (filtros?.accion) where.accion = filtros.accion;
    
    if (filtros?.fechaDesde || filtros?.fechaHasta) {
      where.fechaHora = {};
      if (filtros.fechaDesde) where.fechaHora.gte = filtros.fechaDesde;
      if (filtros.fechaHasta) where.fechaHora.lte = filtros.fechaHasta;
    }

    return await this.auditoriaLog.findMany({
      where,
      orderBy: { fechaHora: 'desc' },
      take: filtros?.limite || 100,
    });
  }
}