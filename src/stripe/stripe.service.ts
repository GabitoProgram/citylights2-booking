import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-08-27.basil',
    });
  }

  /**
   * Crear una sesión de checkout de Stripe
   */
  async createCheckoutSession(
    reservaId: number,
    monto: number,
    descripcion: string,
    customerEmail?: string
  ): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd', // Stripe requiere USD para test mode
              product_data: {
                name: `Reserva de Área Común`,
                description: descripcion,
              },
              unit_amount: Math.round(monto * 100), // Stripe maneja centavos
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reserva-exitosa?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/areas-comunes?canceled=true`,
        customer_email: customerEmail,
        metadata: {
          reservaId: reservaId.toString(),
        },
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // Expira en 30 minutos
      });

      this.logger.log(`✅ Checkout session creada para reserva ${reservaId}: ${session.id}`);
      return session;
    } catch (error) {
      this.logger.error(`❌ Error creando checkout session: ${error.message}`);
      throw new Error(`Error al crear sesión de pago: ${error.message}`);
    }
  }

  /**
   * Verificar el estado de una sesión de checkout
   */
  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      this.logger.log(`📋 Estado de sesión ${sessionId}: ${session.payment_status}`);
      return session;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo sesión ${sessionId}: ${error.message}`);
      throw new Error(`Error al obtener sesión de pago: ${error.message}`);
    }
  }

  /**
   * Verificar el webhook de Stripe
   */
  verifyWebhookSignature(payload: Buffer, signature: string): Stripe.Event {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    if (!endpointSecret) {
      throw new Error('Stripe webhook secret no configurado');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, endpointSecret);
    } catch (error) {
      this.logger.error(`❌ Error verificando webhook: ${error.message}`);
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Obtener información de un payment intent
   */
  async retrievePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      return await this.stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo payment intent ${paymentIntentId}: ${error.message}`);
      throw new Error(`Error al obtener payment intent: ${error.message}`);
    }
  }
}