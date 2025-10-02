import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CreateConfirmacionDto } from './dto/create-confirmacion.dto';
import { UpdateConfirmacionDto } from './dto/update-confirmacion.dto';
import { PrismaClient, Verificacion } from 'generated/prisma';

@Injectable()
export class ConfirmacionService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger(ConfirmacionService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  create(createConfirmacionDto: CreateConfirmacionDto) {
    return this.confirmacion.create({ 
      data: createConfirmacionDto 
    });
  }

  findAll() {
    return this.confirmacion.findMany({
      include: {
        reserva: {
          include: {
            area: true
          }
        }
      }
    });
  }

  findOne(id: number) {
    return this.confirmacion.findUnique({
      where: { id },
      include: {
        reserva: {
          include: {
            area: true
          }
        }
      }
    });
  }

  update(id: number, updateConfirmacionDto: UpdateConfirmacionDto) {
    return this.confirmacion.update({
      where: { id },
      data: updateConfirmacionDto
    });
  }

  // Método especial para verificar confirmación (cambiar estado a ACCEPTED)
  verificar(id: number) {
    return this.confirmacion.update({
      where: { id },
      data: { verificada: Verificacion.ACCEPTED }
    });
  }

  // Método especial para cancelar confirmación (cambiar estado a CANCELLED)
  cancelar(id: number) {
    return this.confirmacion.update({
      where: { id },
      data: { verificada: Verificacion.CANCELLED }
    });
  }

  remove(id: number) {
    return this.confirmacion.delete({
      where: { id }
    });
  }
}