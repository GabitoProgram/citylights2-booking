import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config/envs';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as bodyParser from 'body-parser';


async function bootstrap() {

  const logger = new Logger('Booking-Service');
  
  // Configuración para Puppeteer en producción
  if (process.env.NODE_ENV === 'production') {
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
    process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
  }
  
  const app = await NestFactory.create(AppModule);

  // Configurar middleware para webhook de Stripe (raw body)
  app.use('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }));

  // Configuración para trabajar con Gateway
  app.enableCors({
    origin: [
      'http://localhost:3000', // Gateway
      'http://localhost:3001', // Frontend dev
      'http://localhost:8080', // Frontend prod
      process.env.FRONTEND_URL, // Frontend en producción
      process.env.GATEWAY_URL,  // Gateway en producción
      // Agregar más orígenes según necesidad
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-User-Id',     // Header personalizado del Gateway
      'X-User-Role',   // Header personalizado del Gateway
      'X-User-Name',   // Header personalizado del Gateway
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Prefijo global para APIs (opcional)
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3004;
  await app.listen(port);
  logger.log(`🚀 Booking Microservice running on: http://localhost:${port}`);
  logger.log(`📊 Ready to receive requests from Gateway`);
}
bootstrap();
