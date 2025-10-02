import { 
  Controller, 
  Post, 
  Body, 
  Req, 
  Res, 
  HttpStatus,
  UseGuards,
  Logger,
  Get,
  Param
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { StripeService } from './stripe.service';
import { PagoReservaService } from '../pago-reserva/pago-reserva.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/user.decorator';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { UserFromToken } from '../auth/jwt-auth.guard';

@Controller('stripe')
export class StripeController {
  private readonly logger = new Logger(StripeController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly pagoReservaService: PagoReservaService,
    private readonly auditoriaService: AuditoriaService
  ) {}

  /**
   * Crear sesión de checkout para una reserva
   */
  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  async createCheckoutSession(
    @Body() body: {
      reservaId: number;
      monto: number;
      descripcion: string;
    },
    @GetUser() user: UserFromToken,
    @Req() req: Request
  ) {
    try {
      this.logger.log(`🔄 Creando checkout session para reserva ${body.reservaId} por usuario ${user.nombre}`);

      // Crear la sesión de Stripe
      const session = await this.stripeService.createCheckoutSession(
        body.reservaId,
        body.monto,
        body.descripcion,
        user.email
      );

      // Registrar auditoría
      await this.auditoriaService.registrarAccion({
        usuarioId: user.id,
        usuarioNombre: user.nombre,
        usuarioRol: user.rol,
        accion: 'CREATE_CHECKOUT_SESSION',
        tabla: 'StripeCheckout',
        registroId: session.id,
        datosNuevos: {
          reservaId: body.reservaId,
          monto: body.monto,
          sessionId: session.id
        },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.originalUrl,
        metodo: req.method,
      });

      return {
        success: true,
        sessionId: session.id,
        checkoutUrl: session.url,
        message: 'Sesión de pago creada exitosamente'
      };

    } catch (error) {
      this.logger.error(`❌ Error creando checkout session: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Verificar el estado de una sesión de checkout
   */
  @Get('verify-session/:sessionId')
  @UseGuards(JwtAuthGuard)
  async verifySession(
    @Param('sessionId') sessionId: string,
    @GetUser() user: UserFromToken
  ) {
    try {
      this.logger.log(`🔍 Verificando sesión ${sessionId} por usuario ${user.nombre}`);

      const session = await this.stripeService.retrieveCheckoutSession(sessionId);
      
      // Obtener información de la reserva usando el sessionId desde metadata
      let reservaInfo: any = null;
      let facturaInfo: any = null;
      
      if (session.metadata && session.metadata.reservaId) {
        const reservaId = parseInt(session.metadata.reservaId);
        
        // Buscar información de la reserva y su pago
        const pago = await this.pagoReservaService.obtenerPorReservaId(reservaId);
        if (pago && pago.factura) {
          // La factura ya viene incluida en la consulta
          facturaInfo = {
            id: pago.factura.id,
            numeroFactura: pago.factura.numeroFactura,
            rutaPdf: pago.factura.rutaPdf,
            fechaEmision: pago.factura.fechaEmision
          };
        }
        
        // La reserva también viene incluida en la consulta
        if (pago && pago.reserva) {
          reservaInfo = {
            id: pago.reserva.id,
            areaComun: pago.reserva.area.nombre,
            inicio: pago.reserva.inicio,
            fin: pago.reserva.fin,
            costo: pago.reserva.costo,
            estado: pago.reserva.estado
          };
        }
      }
      
      return {
        success: true,
        session: {
          id: session.id,
          payment_status: session.payment_status,
          customer_email: session.customer_email,
          amount_total: session.amount_total,
          currency: session.currency,
          metadata: session.metadata
        },
        reserva: reservaInfo,
        factura: facturaInfo
      };

    } catch (error) {
      this.logger.error(`❌ Error verificando sesión: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Webhook de Stripe para confirmar pagos
   */
  @Post('webhook')
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response
  ) {
    const signature = req.headers['stripe-signature'] as string;
    const payload = req.body;

    try {
      // Verificar la firma del webhook
      const event = this.stripeService.verifyWebhookSignature(payload, signature);
      
      this.logger.log(`📨 Webhook recibido: ${event.type}`);

      // Manejar diferentes tipos de eventos
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event.data.object);
          break;
        
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        default:
          this.logger.log(`🤷 Evento no manejado: ${event.type}`);
      }

      res.status(HttpStatus.OK).json({ received: true });

    } catch (error) {
      this.logger.error(`❌ Error en webhook: ${error.message}`);
      res.status(HttpStatus.BAD_REQUEST).json({ 
        error: 'Webhook signature verification failed' 
      });
    }
  }

  /**
   * Manejar evento de checkout completado
   */
  private async handleCheckoutSessionCompleted(session: any) {
    try {
      const reservaId = parseInt(session.metadata.reservaId);
      
      if (!reservaId) {
        throw new Error('reservaId no encontrado en metadata de la sesión');
      }

      this.logger.log(`✅ Pago completado para reserva ${reservaId}`);

      // Buscar el pago pendiente para esta reserva
      const pagos = await this.pagoReservaService.findAll();
      const pagosPendientes = pagos.filter(p => 
        p.reservaId === reservaId && 
        p.estado === 'PENDING'
      );

      if (pagosPendientes.length === 0) {
        this.logger.warn(`⚠️ No se encontró pago pendiente para reserva ${reservaId}`);
        return;
      }

      const pago = pagosPendientes[0];

      // Confirmar el pago (esto generará automáticamente el PDF)
      await this.pagoReservaService.confirmarPago(pago.id);

      this.logger.log(`🎉 Reserva ${reservaId} confirmada y PDF generado automáticamente`);

    } catch (error) {
      this.logger.error(`❌ Error procesando checkout completado: ${error.message}`);
    }
  }

  /**
   * Manejar evento de payment intent exitoso
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any) {
    this.logger.log(`💳 Payment Intent exitoso: ${paymentIntent.id}`);
    // Lógica adicional si es necesaria
  }

  /**
   * Generar factura manualmente para una sesión si no existe
   */
  @Post('generate-invoice/:sessionId')
  @UseGuards(JwtAuthGuard)
  async generateInvoiceForSession(
    @Param('sessionId') sessionId: string,
    @GetUser() user: UserFromToken
  ) {
    try {
      this.logger.log(`🧾 Generando factura manual para sesión ${sessionId} por usuario ${user.nombre}`);

      const session = await this.stripeService.retrieveCheckoutSession(sessionId);
      
      if (!session.metadata || !session.metadata.reservaId) {
        return {
          success: false,
          message: 'No se encontró información de reserva en la sesión'
        };
      }

      const reservaId = parseInt(session.metadata.reservaId);
      const pago = await this.pagoReservaService.obtenerPorReservaId(reservaId);

      if (!pago) {
        return {
          success: false,
          message: 'No se encontró pago para esta reserva'
        };
      }

      if (pago.factura) {
        this.logger.log(`📋 Factura ya existe para reserva ${reservaId}: ${pago.factura.numeroFactura}`);
        return {
          success: true,
          message: 'Factura ya existe',
          factura: {
            id: pago.factura.id,
            numeroFactura: pago.factura.numeroFactura,
            rutaPdf: pago.factura.rutaPdf,
            fechaEmision: pago.factura.fechaEmision
          }
        };
      }

      // Generar factura por primera vez
      this.logger.log(`🧾 Generando factura por primera vez para reserva ${reservaId}`);
      await this.pagoReservaService.confirmarPago(pago.id);
      
      // Obtener la factura recién creada
      const pagoActualizado = await this.pagoReservaService.obtenerPorReservaId(reservaId);
      
      return {
        success: true,
        message: 'Factura generada exitosamente',
        factura: pagoActualizado?.factura ? {
          id: pagoActualizado.factura.id,
          numeroFactura: pagoActualizado.factura.numeroFactura,
          rutaPdf: pagoActualizado.factura.rutaPdf,
          fechaEmision: pagoActualizado.factura.fechaEmision
        } : null
      };

    } catch (error) {
      this.logger.error(`❌ Error generando factura manual: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }
}