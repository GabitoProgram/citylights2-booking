import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { PrismaClient } from 'generated/prisma';

@Injectable()
export class BookingService extends PrismaClient implements OnModuleInit {

  private readonly logger = new Logger(BookingService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to the database');
  }
  create(createBookingDto: CreateBookingDto) {
    return this.areaComun.create({ 
      data: createBookingDto 
    });

  }

  findAll() {
    return this.areaComun.findMany();
  }

  findOne(id: number) {
    return this.areaComun.findUnique({
      where: { id }
    });
  }

  update(id: number, updateBookingDto: UpdateBookingDto) {
    return this.areaComun.update({
      where: { id },
      data: updateBookingDto
    });
  }

  remove(id: number) {
    return this.areaComun.delete({
      where: { id }
    });
  }
}
