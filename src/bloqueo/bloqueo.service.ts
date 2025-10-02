import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { UpdateBloqueoDto } from './dto/update-bloqueo.dto';
import { PrismaClient } from 'generated/prisma';

@Injectable()
export class BloqueoService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger(BloqueoService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }

  create(createBloqueoDto: CreateBloqueoDto) {
    return this.bloqueo.create({ 
      data: createBloqueoDto 
    });
  }

  findAll() {
    return this.bloqueo.findMany({
      include: {
        area: true
      }
    });
  }

  findOne(id: number) {
    return this.bloqueo.findUnique({
      where: { id },
      include: {
        area: true
      }
    });
  }

  update(id: number, updateBloqueoDto: UpdateBloqueoDto) {
    return this.bloqueo.update({
      where: { id },
      data: updateBloqueoDto
    });
  }

  remove(id: number) {
    return this.bloqueo.delete({
      where: { id }
    });
  }
}