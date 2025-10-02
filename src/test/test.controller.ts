import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UserFromToken } from '../auth/jwt-auth.guard';

@Controller('test')
export class TestController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  /**
   * Endpoint para probar la autenticaci贸n y auditor铆a
   */
  @Get('auth')
  @UseGuards(JwtAuthGuard)
  async testAuth(@GetUser() user: UserFromToken) {
    // Registrar que el usuario accedi贸 al endpoint de prueba
    await this.auditoriaService.registrarAccion({
      usuarioId: user.id,
      usuarioNombre: user.nombre,
      usuarioRol: user.rol,
      accion: 'READ',
      tabla: 'Test',
      endpoint: '/api/test/auth',
      metodo: 'GET',
    });

    return {
      success: true,
      message: 'Autenticaci贸n exitosa',
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Endpoint para obtener logs de auditor铆a (solo admins)
   */
  @Get('logs')
  @UseGuards(JwtAuthGuard)
  async getLogs(@GetUser() user: UserFromToken) {
    // Solo permitir a admins ver logs
    if (user.rol !== 'admin') {
      return {
        success: false,
        message: 'No tienes permisos para ver los logs',
      };
    }

    const logs = await this.auditoriaService.obtenerLogs({
      limite: 50,
    });

    return {
      success: true,
      data: logs,
    };
  }

  /**
   * Endpoint sin autenticaci贸n para verificar el servicio
   */
  @Get('health')
  getHealth() {
    return {
      success: true,
      service: 'booking-microservice',
      status: 'running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      features: [
        'JWT Authentication',
        'Audit Logging', 
        'Gateway Ready',
        'CORS Configured',
        'CITYLIGHTS Branding'
      ]
    };
  }

  /**
   * Endpoint para probar Gateway sin autenticaci胣 JWT
   * Muestra los headers que recibe del Gateway
   */
  @Get('gateway-test')
  gatewayTest(@Req() request: any) {
    const headers = {
      'x-user-id': request.headers['x-user-id'] || 'No establecido',
      'x-user-name': request.headers['x-user-name'] || 'No establecido',
      'x-user-role': request.headers['x-user-role'] || 'No establecido',
      'x-user-email': request.headers['x-user-email'] || 'No establecido',
      'authorization': request.headers['authorization'] ? 'Presente' : 'No presente'
    };

    return {
      success: true,
      message: 'Endpoint de prueba Gateway',
      service: 'booking-microservice',
      timestamp: new Date().toISOString(),
      headers: headers,
      note: 'Este endpoint NO valida JWT, solo muestra los headers del Gateway'
    };
  }
}
