import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ConfirmacionService } from './confirmacion.service';
import { CreateConfirmacionDto } from './dto/create-confirmacion.dto';
import { UpdateConfirmacionDto } from './dto/update-confirmacion.dto';

@Controller('confirmacion')
export class ConfirmacionController {
  constructor(private readonly confirmacionService: ConfirmacionService) {}

  // Ruta HTTP POST para crear una confirmacion
  @Post()
  createHttp(@Body() createConfirmacionDto: CreateConfirmacionDto) {
    return this.confirmacionService.create(createConfirmacionDto);
  }

  // Ruta HTTP GET para obtener todas las confirmaciones
  @Get()
  findAllHttp() {
    return this.confirmacionService.findAll();
  }

  // Ruta HTTP GET para buscar confirmacion por id
  @Get(':id')
  findOneHttp(@Param('id') id: number) {
    return this.confirmacionService.findOne(Number(id));
  }

  // Ruta HTTP PUT para actualizar una confirmacion
  @Put(':id')
  updateHttp(@Param('id') id: number, @Body() updateConfirmacionDto: UpdateConfirmacionDto) {
    return this.confirmacionService.update(Number(id), updateConfirmacionDto);
  }

  // Ruta HTTP DELETE para eliminar una confirmacion
  @Delete(':id')
  removeHttp(@Param('id') id: number) {
    return this.confirmacionService.remove(Number(id));
  }

  // Ruta HTTP PUT para verificar confirmacion
  @Put(':id/verificar')
  verificarHttp(@Param('id') id: number) {
    return this.confirmacionService.verificar(Number(id));
  }

  // Ruta HTTP PUT para cancelar confirmacion
  @Put(':id/cancelar')
  cancelarHttp(@Param('id') id: number) {
    return this.confirmacionService.cancelar(Number(id));
  }

  @MessagePattern('removeConfirmacion')
  remove(@Payload() id: number) {
    return this.confirmacionService.remove(id);
  }
}