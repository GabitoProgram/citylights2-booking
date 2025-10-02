# Instrucciones de Despliegue en Render

## Booking Service

Este microservicio maneja las reservas y facturación del sistema.

### Configuración de Variables de Entorno

Las siguientes variables deben configurarse en Render:

- `DATABASE_URL`: Se configura automáticamente desde la base de datos
- `JWT_SECRET`: Generado automáticamente por Render
- `NODE_ENV`: production
- `PORT`: 10000

### Comandos de Build

```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

### Comando de Start

```bash
npm run start:prod
```

## Características

- ✅ NestJS Framework
- ✅ PostgreSQL con Prisma ORM
- ✅ Generación de PDFs con Puppeteer
- ✅ Integración con Stripe
- ✅ Autenticación JWT
- ✅ Validación con class-validator

## Nota sobre Puppeteer

Si tienes problemas con Puppeteer en Render, agrega esta configuración al main.ts:

```typescript
import puppeteer from 'puppeteer';

// En producción, configurar Puppeteer para entornos sin GUI
if (process.env.NODE_ENV === 'production') {
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
  process.env.PUPPETEER_EXECUTABLE_PATH = '/usr/bin/chromium-browser';
}
```