import { Test, TestingModule } from '@nestjs/testing';
import { PagoReservaService } from './pago-reserva.service';

describe('PagoReservaService', () => {
  let service: PagoReservaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PagoReservaService],
    }).compile();

    service = module.get<PagoReservaService>(PagoReservaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
