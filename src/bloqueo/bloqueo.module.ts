import { Module } from '@nestjs/common';
import { BloqueoService } from './bloqueo.service';
import { BloqueoController } from './bloqueo.controller';

@Module({
  controllers: [BloqueoController],
  providers: [BloqueoService],
})
export class BloqueoModule {}