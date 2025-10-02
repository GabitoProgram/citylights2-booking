import { IsDateString, IsEnum, IsNumber, IsString, IsOptional } from "class-validator";
import { EstadoReserva } from "generated/prisma";

export class CreateReservaDto {

    @IsNumber()
    areaId: number;

    @IsOptional()
    @IsString()
    usuarioId?: string;

    @IsDateString()
    inicio: string;

    @IsDateString()
    fin: string;

    @IsEnum(EstadoReserva)
    @IsOptional()
    estado?: EstadoReserva = EstadoReserva.PENDING;

    @IsOptional()
    @IsNumber()
    costo?: number;

    @IsOptional()
    @IsString()
    usuarioNombre?: string;

    @IsOptional()
    @IsString()
    usuarioRol?: string;

}