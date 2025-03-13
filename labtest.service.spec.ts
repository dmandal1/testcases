import { Test, TestingModule } from '@nestjs/testing';
import { LabTestService } from './labTest.service';
import { Connection, QueryRunner } from 'typeorm';
import { QueueMessageService } from '@modules/utils/queueMessage/queueMessage.service';
import { IncomingRequestService } from '@modules/utils/incomingRequest/incomingRequest.service';
import { QueueMessageClaimService } from '@modules/utils/queueMessageClaim/queueMessageClaim.service';
import { ServiceBus } from '@providers/serviceBus/serviceBus.service';
import { CacheService } from '@providers/cache/cache.service';
import { SampleEvaluationService } from '@providers/sampleEvaluation/sampleEvaluation.service';
import { CodeListService } from '@modules/codeLists/codeLists.service';
import { Logger } from '@nestjs/common';

describe('LabTestService', () => {
  let service: LabTestService;
  let connection: Connection;
  let queryRunner: QueryRunner;
  let queueMessageService: QueueMessageService;
  let queueMessageClaimService: QueueMessageClaimService;
  let serviceBus: ServiceBus;
  let cacheService: CacheService;
  let sampleEvalService: SampleEvaluationService;
  let codeListService: CodeListService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabTestService,
        {
          provide: Connection,
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
            }),
          },
        },
        {
          provide: QueueMessageService,
          useValue: {
            createQueueMessage: jest.fn(),
            deleteQueueMessage: jest.fn(),
            updateQueueMessage: jest.fn(),
            getQueueMessagesStatus: jest.fn(),
          },
        },
        {
          provide: QueueMessageClaimService,
          useValue: {
            createClaimRecord: jest.fn(),
            findClaimRecord: jest.fn(),
          },
        },
        {
          provide: ServiceBus,
          useValue: {
            sendMessage: jest.fn(),
            consumeMsg: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: SampleEvaluationService,
          useValue: {
            processClaim: jest.fn(),
          },
        },
        {
          provide: CodeListService,
          useValue: {
            generateCacheKey: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LabTestService>(LabTestService);
    connection = module.get<Connection>(Connection);
    queryRunner = connection.createQueryRunner();
    queueMessageService = module.get<QueueMessageService>(QueueMessageService);
    queueMessageClaimService = module.get<QueueMessageClaimService>(QueueMessageClaimService);
    serviceBus = module.get<ServiceBus>(ServiceBus);
    cacheService = module.get<CacheService>(CacheService);
    sampleEvalService = module.get<SampleEvaluationService>(SampleEvaluationService);
    codeListService = module.get<CodeListService>(CodeListService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processRequest', () => {
    it('should start and commit transaction on success', async () => {
      jest.spyOn(service, 'createQueueMessages').mockResolvedValue();

      await service.processRequest({ request_body: {} }, {});

      expect(queryRunner.connect).toHaveBeenCalled();
      expect(queryRunner.startTransaction).toHaveBeenCalled();
      expect(service.createQueueMessages).toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      jest.spyOn(service, 'createQueueMessages').mockRejectedValue(new Error('Test error'));

      await expect(service.processRequest({ request_body: {} }, {})).rejects.toThrow('Test error');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
    });
  });

  describe('createQueueMessages', () => {
    it('should create queue messages', async () => {
      queueMessageService.createQueueMessage.mockResolvedValue({ id: 1 });

      const mockRequest = {
        request_body: { ians: ['123'] },
      };

      jest.spyOn(service, 'createQueueMessageClaim').mockResolvedValue();

      await service.createQueueMessages(queryRunner, mockRequest, {});

      expect(queueMessageService.createQueueMessage).toHaveBeenCalledWith('123', mockRequest);
      expect(service.createQueueMessageClaim).toHaveBeenCalled();
    });
  });

  describe('createQueueMessageClaim', () => {
    it('should create queue message claim and send message', async () => {
      jest.spyOn(service, 'sendMessageAndUpdate').mockResolvedValue();

      await service.createQueueMessageClaim(queryRunner, { request_body: {} }, { id: 1 }, {});

      expect(queueMessageClaimService.createClaimRecord).toHaveBeenCalled();
      expect(service.sendMessageAndUpdate).toHaveBeenCalled();
    });

    it('should rollback queue message if claim creation fails', async () => {
      queueMessageClaimService.createClaimRecord.mockRejectedValue(new Error('Claim error'));

      await expect(service.createQueueMessageClaim(queryRunner, { request_body: {} }, { id: 1 }, {})).rejects.toThrow('Claim error');

      expect(queueMessageService.deleteQueueMessage).toHaveBeenCalledWith(1);
    });
  });

  describe('sendMessageAndUpdate', () => {
    it('should send message and update queue message', async () => {
      serviceBus.sendMessage.mockResolvedValue('messageSent');
      queueMessageService.updateQueueMessage.mockResolvedValue({});

      await service.sendMessageAndUpdate({ id: 1 }, {});

      expect(serviceBus.sendMessage).toHaveBeenCalled();
      expect(queueMessageService.updateQueueMessage).toHaveBeenCalledWith(1, {
        status: 'queued',
        body: { id: 1 },
      });
    });
  });

  describe('getStatus', () => {
    it('should return queue message status', async () => {
      queueMessageService.getQueueMessagesStatus.mockResolvedValue({ status: 'queued' });

      const result = await service.getStatus('123');

      expect(result).toEqual({ status: 'queued' });
      expect(queueMessageService.getQueueMessagesStatus).toHaveBeenCalledWith('123');
    });
  });

  describe('processConsumedMessage', () => {
    it('should process valid claims', async () => {
      const mockMessage = { body: 'testBody' };
      const mockRecord = { claim: 'testClaim' };

      queueMessageClaimService.findClaimRecord.mockResolvedValue(mockRecord);
      codeListService.generateCacheKey.mockReturnValue('cacheKey');
      cacheService.get.mockResolvedValue(['valid_code']);
      jest.spyOn(service, 'logger', 'get').mockReturnValue({ log: jest.fn() });

      await service.processConsumedMessage([mockMessage], {});

      expect(queueMessageClaimService.findClaimRecord).toHaveBeenCalledWith(mockMessage);
      expect(sampleEvalService.processClaim).toHaveBeenCalledWith('testClaim', {});
    });

    it('should throw an error if no claim is found', async () => {
      queueMessageClaimService.findClaimRecord.mockResolvedValue(null);

      await expect(service.processConsumedMessage([{ messageId: '123' }], {})).rejects.toThrow();

      expect(queueMessageClaimService.findClaimRecord).toHaveBeenCalled();
    });
  });
});
