import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { AuthModule } from '../auth/auth.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [TestController],
})
export class TestModule {}