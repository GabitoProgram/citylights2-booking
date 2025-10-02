import { IsBoolean, IsNumber, IsString, IsOptional } from "class-validator";

export class CreateBookingDto {

    @IsString()
    nombre: string;

    @IsString()
    @IsOptional()
    descripcion?: string;

    @IsNumber()
    capacidad: number;

    @IsNumber()
    costoHora: number;

    @IsBoolean()
    @IsOptional()
    activa?: boolean = true;


}
