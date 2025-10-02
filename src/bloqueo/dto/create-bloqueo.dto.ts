import { IsDateString, IsNumber, IsString, IsOptional } from "class-validator";

export class CreateBloqueoDto {

    @IsNumber()
    areaId: number;

    @IsDateString()
    inicio: string;

    @IsDateString()
    fin: string;

    @IsString()
    @IsOptional()
    motivo?: string;

}