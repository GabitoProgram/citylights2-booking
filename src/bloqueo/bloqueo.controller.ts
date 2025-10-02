import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { BloqueoService } from './bloqueo.service';
import { CreateBloqueoDto } from './dto/create-bloqueo.dto';
import { UpdateBloqueoDto } from './dto/update-bloqueo.dto';

@Controller('bloqueo')
export class BloqueoController {
  constructor(private readonly bloqueoService: BloqueoService) {}

  // Ruta HTTP POST para crear un bloqueo
  @Post()
  createHttp(@Body() createBloqueoDto: CreateBloqueoDto) {
    return this.bloqueoService.create(createBloqueoDto);
  }

  // Ruta HTTP GET para obtener todos los bloqueos
  @Get()
  findAllHttp() {
    return this.bloqueoService.findAll();
  }

  // Ruta HTTP GET para buscar bloqueo por id
  @Get(':id')
  findOneHttp(@Param('id') id: string) {
    return this.bloqueoService.findOne(Number(id));
  }

  // Ruta HTTP PUT para actualizar un bloqueo
  @Put(':id')
  updateHttp(@Param('id') id: number, @Body() updateBloqueoDto: UpdateBloqueoDto) {
    return this.bloqueoService.update(Number(id), updateBloqueoDto);
  }

  // Ruta HTTP DELETE para eliminar un bloqueo
  @Delete(':id')
  removeHttp(@Param('id') id: number) {
    return this.bloqueoService.remove(Number(id));
  }
}