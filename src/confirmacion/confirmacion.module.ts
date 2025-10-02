import { Module } from '@nestjs/common';
import { ConfirmacionService } from './confirmacion.service';
import { ConfirmacionController } from './confirmacion.controller';

@Module({
  controllers: [ConfirmacionController],
  providers: [ConfirmacionService],
})
export class ConfirmacionModule {}