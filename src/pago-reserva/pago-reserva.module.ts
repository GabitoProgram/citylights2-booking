import { Module } from '@nestjs/common';
import { PagoReservaService } from './pago-reserva.service';
import { PagoReservaController } from './pago-reserva.controller';
import { FacturaModule } from '../factura/factura.module';
import { AuthModule } from '../auth/auth.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [FacturaModule, AuthModule, AuditoriaModule],
  controllers: [PagoReservaController],
  providers: [PagoReservaService],
  exports: [PagoReservaService]
})
export class PagoReservaModule {}
