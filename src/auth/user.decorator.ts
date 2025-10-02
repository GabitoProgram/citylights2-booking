import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserFromToken } from './jwt-auth.guard';

/**
 * Decorador personalizado para extraer automáticamente 
 * los datos del usuario del token JWT
 * 
 * Uso:
 * @Get()
 * @UseGuards(JwtAuthGuard)
 * async miEndpoint(@GetUser() user: UserFromToken) {
 *   console.log(user.id, user.nombre, user.rol);
 * }
 */
export const GetUser = createParamDecorator(
  (data: keyof UserFromToken | undefined, ctx: ExecutionContext): UserFromToken | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Si se especifica un campo específico, devolver solo ese campo
    if (data) {
      return user?.[data];
    }

    // Devolver todo el objeto user
    return user;
  },
);

/**
 * Decorador para extraer solo el ID del usuario
 */
export const GetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id;
  },
);

/**
 * Decorador para extraer solo el nombre del usuario
 */
export const GetUserName = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.nombre;
  },
);

/**
 * Decorador para extraer solo el rol del usuario
 */
export const GetUserRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.rol;
  },
);