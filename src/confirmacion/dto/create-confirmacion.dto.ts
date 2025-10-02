import { IsEnum, IsNumber, IsString, IsOptional, IsDateString } from "class-validator";
import { Verificacion } from "generated/prisma";

export class CreateConfirmacionDto {

    @IsNumber()
    reservaId: number;

    @IsString()
    codigoQr: string;

    @IsDateString()
    @IsOptional()
    fecha?: string;

    @IsEnum(Verificacion)
    @IsOptional()
    verificada?: Verificacion = Verificacion.PENDING;

}