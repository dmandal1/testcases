import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Connection, QueryRunner } from 'typeorm';
import { IncomingRequestService } from '@modules/utils/incomingRequest/incomingRequest.service';
import { IncomingRequestDto } from '@modules/utils/incomingRequest/incomingRequest.dto';
import { QueueMessageService } from '@modules/utils/queueMessage/queueMessage.service';
import { QueueMessageClaimService } from '@modules/utils/queueMessageClaim/queueMessageClaim.service';
import { ServiceBus } from '@providers/serviceBus/serviceBus.service';
import { QueueMessage } from '@modules/utils/queueMessage/queueMessage.entity';
import { LABTEST_STATUS } from 'src/common/utils/labTest/config';
import { CACHE_KEYS, CacheService } from '@providers/cache/cache.service';
import { validateClaim } from './validation/codelist-validator';
import { SampleEvaluationService } from '@providers/sampleEvaluation/sampleEvaluation.service';
import { LabTestHttpException } from './exception/labTest-http.exception';
import { CodeListService } from '@modules/codeLists/codeLists.service';
import { labTestExecutorAllowedCodeLists } from '@modules/codeLists/codeLists.constants';

@Injectable()
export class LabTestService {
  private readonly logger = new Logger(LabTestService.name);

  constructor(
    @InjectConnection('aclDbConnection')
    private readonly connection: Connection,
    private readonly queueMessageService: QueueMessageService,
    private readonly incomingRequestService: IncomingRequestService,
    private readonly queueMessageClaimService: QueueMessageClaimService,
    private readonly serviceBus: ServiceBus,
    private readonly cacheService: CacheService,
    private readonly sampleEvalService: SampleEvaluationService,
    private readonly codeListService: CodeListService,
  ) {}

  async processRequest(queueMsgData: any, user): Promise<void> {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.createQueueMessages(queryRunner, queueMsgData, user);
      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error('Error processing queue message:', error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createQueueMessages(
    queryRunner: QueryRunner,
    incomingRequest: any,
    user,
  ): Promise<void> {
    try {
      for (const ian of incomingRequest?.request_body?.ians) {
        const queueMessage = await this.queueMessageService.createQueueMessage(
          ian,
          incomingRequest,
        );
        this.logger.log('Inserted QueueMessages:', queueMessage);
        const modifiedRequest = {
          ...incomingRequest,
          request_body: {
            ...incomingRequest.request_body,
            ians: [ian],
          },
        };
        await this.createQueueMessageClaim(
          queryRunner,
          modifiedRequest,
          queueMessage,
          user,
        );
      }
    } catch (error) {
      this.logger.error('Error in createQueueMessages:', error);
      throw error;
    }
  }

  async createQueueMessageClaim(
    queryRunner: QueryRunner,
    incomingRequestDto: IncomingRequestDto,
    queueMessage: QueueMessage,
    user,
  ): Promise<void> {
    try {
      const claimData = {
        claim: incomingRequestDto.request_body,
        created_at: new Date(),
        queueMessage: queueMessage,
      };
      await this.queueMessageClaimService.createClaimRecord(claimData);
      this.logger.log('Inserted QueueMessages claim:', queueMessage);
      await this.sendMessageAndUpdate(queueMessage, user);
    } catch (error) {
      this.logger.error('Error in createQueueMessageClaim:', error);
      await this.queueMessageService.deleteQueueMessage(queueMessage.id); // Rollback QueueMsg if QueueMsgClaim fails
      throw error;
    }
  }

  async sendMessageAndUpdate(queueMessage: QueueMessage, user): Promise<void> {
    try {
      const msg = await this.serviceBus.sendMessage(queueMessage);
      await this.queueMessageService.updateQueueMessage(queueMessage.id, {
        status: 'queued',
        body: queueMessage,
      });

      // this need to be refactored
      setTimeout(async () => {
        const consumedMessages = await this.serviceBus.consumeMsg();
        this.processConsumedMessage(consumedMessages, user);
      }, 10000);
    } catch (error) {
      this.logger.error('Error in sendMessageAndUpdate:', error);
      throw error;
    }
  }

  async getStatus(
    requestId: string,
  ): Promise<{ status: LABTEST_STATUS; message?: string }> {
    try {
      return await this.queueMessageService.getQueueMessagesStatus(requestId);
    } catch (error) {
      this.logger.error('Error in getStatus:', error);
      throw error;
    }
  }

  async processConsumedMessage(consumedMessages: any[], user) {
    // Process consumed messages if needed
    for (const message of consumedMessages) {
      this.logger.log(`Consumed message: ${message.body}`);
      const record = await this.queueMessageClaimService.findClaimRecord(
        message,
      );
      if (record) {
        Logger.log(`Fetched claim: ${JSON.stringify(record)}`);
        const key = this.codeListService.generateCacheKey(
          labTestExecutorAllowedCodeLists,
          user,
        );
        const allCodes = await this.cacheService.get(key);
        const isValid = validateClaim(record.claim, allCodes);
        this.logger.log('isValid------1', isValid);
        this.logger.log('isValid------2', record.claim);
        // if (isValid) {
        await this.sampleEvalService.processClaim(record.claim, user);
        Logger.log(`Claim processed successfully: ${record.claim}`);
        // } else {
        //   throw new LabTestHttpException(400, 'Invalid codelist');
        // }
      } else {
        Logger.warn(`No claim found for messageId: ${message.messageId}`);
        throw new LabTestHttpException(400, 'Invalid claim');
      }
    }
  }
}
