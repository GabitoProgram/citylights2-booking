import { Test, TestingModule } from '@nestjs/testing';
import { PagoReservaController } from './pago-reserva.controller';

describe('PagoReservaController', () => {
  let controller: PagoReservaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PagoReservaController],
    }).compile();

    controller = module.get<PagoReservaController>(PagoReservaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
