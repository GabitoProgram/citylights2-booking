import { Module } from '@nestjs/common';
import { ReservaService } from './reserva.service';
import { ReservaController } from './reserva.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { StripeModule } from '../stripe/stripe.module';
import { PagoReservaModule } from '../pago-reserva/pago-reserva.module';

@Module({
  imports: [AuthModule, AuditoriaModule, StripeModule, PagoReservaModule],
  controllers: [ReservaController],
  providers: [ReservaService],
})
export class ReservaModule {}