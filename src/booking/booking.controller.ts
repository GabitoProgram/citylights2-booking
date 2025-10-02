import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  // Ruta HTTP POST para crear una reserva
  @Post()
  createHttp(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.create(createBookingDto);
  }

  // Ruta HTTP GET para obtener todas las reservas
  @Get()
  findAllHttp() {
    return this.bookingService.findAll();
  }

  // Ruta HTTP GET para obtener una reserva por id
  @Get(':id')
  findOneHttp(@Param('id') id: number) {
    return this.bookingService.findOne(Number(id));
  }

  // Ruta HTTP PUT para actualizar una reserva
  @Put(':id')
  updateHttp(@Param('id') id: number, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingService.update(Number(id), updateBookingDto);
  }

  // Ruta HTTP DELETE para eliminar una reserva
  @Delete(':id')
  removeHttp(@Param('id') id: number) {
    return this.bookingService.remove(Number(id));
  }
}
