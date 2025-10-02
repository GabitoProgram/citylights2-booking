import { Module } from '@nestjs/common';
import { BookingModule } from './booking/booking.module';
import { ReservaModule } from './reserva/reserva.module';
import { ConfirmacionModule } from './confirmacion/confirmacion.module';
import { PagoReservaModule } from './pago-reserva/pago-reserva.module';
import { BloqueoModule } from './bloqueo/bloqueo.module';
import { FacturaModule } from './factura/factura.module';
import { AuthModule } from './auth/auth.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { TestModule } from './test/test.module';
import { StripeModule } from './stripe/stripe.module';


@Module({
  imports: [
    AuthModule,
    AuditoriaModule,
    TestModule,
    BookingModule,
    ReservaModule,
    ConfirmacionModule,
    PagoReservaModule,
    BloqueoModule,
    FacturaModule,
    StripeModule
  ],

})
export class AppModule {}
