import { Test, TestingModule } from '@nestjs/testing';
import { LabTestService } from '../labTest.service';
import { QueueMessageService } from '@modules/utils/queueMessage/queueMessage.service';
import { QueueMessageClaimService } from '@modules/utils/queueMessageClaim/queueMessageClaim.service';
import { ServiceBus } from '@providers/serviceBus/serviceBus.service';
import { IncomingRequestService } from '@modules/utils/incomingRequest/incomingRequest.service';
import { CacheService } from '@providers/cache/cache.service';
import { SampleEvaluationService } from '@providers/sampleEvaluation/sampleEvaluation.service';
import { CodeListService } from '@modules/codeLists/codeLists.service';
import { getConnectionToken } from '@nestjs/typeorm';
import { Connection, QueryRunner } from 'typeorm';
import { IncomingRequestDto } from '@modules/utils/incomingRequest/incomingRequest.dto';
import { QueueMessage } from '@modules/utils/queueMessage/queueMessage.entity';
import { Logger } from '@nestjs/common';

jest.mock('@modules/utils/queueMessage/queueMessage.service');
jest.mock('@modules/utils/queueMessageClaim/queueMessageClaim.service');
jest.mock('@providers/serviceBus/serviceBus.service');
jest.mock('@modules/utils/incomingRequest/incomingRequest.service');
jest.mock('@providers/cache/cache.service');
jest.mock('@providers/sampleEvaluation/sampleEvaluation.service');
jest.mock('@modules/codeLists/codeLists.service');

describe('LabTestService', () => {
  let service: LabTestService;
  let queueMessageService: jest.Mocked<QueueMessageService>;
  let queueMessageClaimService: jest.Mocked<QueueMessageClaimService>;
  let serviceBus: jest.Mocked<ServiceBus>;
  let connection: jest.Mocked<Connection>;
  let queryRunner: jest.Mocked<QueryRunner>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabTestService,
        QueueMessageService,
        QueueMessageClaimService,
        ServiceBus,
        IncomingRequestService,
        CacheService,
        SampleEvaluationService,
        CodeListService,
        {
          provide: getConnectionToken('aclDbConnection'),
          useValue: {
            createQueryRunner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LabTestService>(LabTestService);
    queueMessageService = module.get(QueueMessageService);
    queueMessageClaimService = module.get(QueueMessageClaimService);
    serviceBus = module.get(ServiceBus);
    connection = module.get(getConnectionToken('aclDbConnection'));

    // Mock QueryRunner
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    } as unknown as jest.Mocked<QueryRunner>;

    connection.createQueryRunner = jest.fn().mockReturnValue(queryRunner);
  });

  it('should processRequest successfully', async () => {
    const mockUser = {
      id: '123',
      name: 'Test User',
    } as any;

    const mockIncomingRequestDto: IncomingRequestDto = {
      user: mockUser,
      method: 'POST',
      url: '/api/test',
      request_body: { ians: ['123'] },
      response_status: '200',
      error_message: null,
    };

    const mockQueueMessage = {
      id: 'mock-id',
    } as unknown as QueueMessage;

    queueMessageService.createQueueMessage = jest
      .fn()
      .mockResolvedValue(mockQueueMessage);
    queueMessageClaimService.createClaimRecord = jest.fn().mockResolvedValue(undefined);
    serviceBus.sendMessage = jest.fn().mockResolvedValue(undefined);
    queueMessageService.updateQueueMessage = jest.fn().mockResolvedValue(undefined);

    await expect(service.processRequest(mockIncomingRequestDto, mockUser)).resolves.toBeUndefined();

    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queueMessageService.createQueueMessage).toHaveBeenCalled();
    expect(queueMessageClaimService.createClaimRecord).toHaveBeenCalled();
    expect(serviceBus.sendMessage).toHaveBeenCalled();
    expect(queueMessageService.updateQueueMessage).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('should rollback transaction on error in processRequest', async () => {
    const mockUser = {
      id: '123',
      name: 'Test User',
    } as any;

    const mockIncomingRequestDto: IncomingRequestDto = {
      user: mockUser,
      method: 'POST',
      url: '/api/test',
      request_body: { ians: ['123'] },
      response_status: '200',
      error_message: null,
    };

    queueMessageService.createQueueMessage = jest
      .fn()
      .mockRejectedValue(new Error('QueueMessage error'));

    await expect(service.processRequest(mockIncomingRequestDto, mockUser)).rejects.toThrow(
      'QueueMessage error',
    );

    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queueMessageService.createQueueMessage).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});