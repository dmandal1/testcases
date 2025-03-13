import { Test, TestingModule } from '@nestjs/testing';
import { LabTestService } from './labTest.service';
import { QueueMessageService } from '@modules/utils/queueMessage/queueMessage.service';
import { forwardRef } from '@nestjs/common';

describe('LabTestService', () => {
  let service: LabTestService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabTestService,
        {
          provide: QueueMessageService,
          useClass: forwardRef(() => QueueMessageService),
        },
      ],
    }).compile();

    service = module.get<LabTestService>(LabTestService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});