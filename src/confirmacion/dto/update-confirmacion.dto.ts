import { PartialType } from '@nestjs/mapped-types';
import { CreateConfirmacionDto } from './create-confirmacion.dto';

export class UpdateConfirmacionDto extends PartialType(CreateConfirmacionDto) {
  id: number;
}