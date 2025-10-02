import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface UserFromToken {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

// Extender la interfaz Request para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: UserFromToken;
    }
  }
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    try {
      console.log('🔍 [JWT Guard] Token recibido:', token.substring(0, 50) + '...');
      console.log('🔍 [JWT Guard] JWT_SECRET disponible:', process.env.JWT_SECRET ? 'YES' : 'NO');
      
      // Verificar y decodificar el token
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'fallback-secret-key'
      });

      console.log('🔍 [JWT Guard] Payload decodificado:', payload);

      // Validar que el payload tenga los campos requeridos
      if (!payload.sub || !(payload.name || payload.firstName || payload.username) || !payload.role) {
        console.log('❌ [JWT Guard] Faltan campos en payload:', { sub: payload.sub, name: payload.name, firstName: payload.firstName, username: payload.username, role: payload.role });
        throw new UnauthorizedException('Token inválido: faltan campos requeridos');
      }

      // Agregar la información del usuario al request (usando el campo correcto para el nombre)
      request.user = {
        id: payload.sub,
        nombre: payload.name || payload.firstName || payload.username || '',
        email: payload.email,
        rol: payload.role
      };

      console.log('✅ [JWT Guard] Usuario autenticado:', request.user);
      return true;
    } catch (error) {
      console.error('❌ [JWT Guard] Error verificando token:', error.message);
      console.error('❌ [JWT Guard] Error details:', error);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    // Buscar token en el header Authorization
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}