import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CBX_ENDPOINTS } from '@constants';
import { CbxHttpService } from '../../providers/cbxHttpService/cbxHttp.service';
import {
  CodeListCbxResponseDto,
  CodeListDto,
  MultipleCodeListDto,
  ReferenceDataDto,
} from './codeLists.dto';
import { CODE_LIST_NAME_MAPPINGS } from './codeLists.constants';
import { CbxVersion } from '@types';
import { InjectRepository } from '@nestjs/typeorm';
import { CbxAccount } from '@modules/aclAuth/entities/CbxAccount.entity';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '@modules/aclAuth/entities/User.entity';
import { CacheService } from '@providers/cache/cache.service';
 
@Injectable()
export class CodeListService {
  private cbxAdminAccount: CbxAccount;
 
  constructor(
    private readonly cbxHttpService: CbxHttpService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    @InjectRepository(CbxAccount, 'aclDbConnection')
    private readonly cbxAccountRepository: Repository<CbxAccount>,
 
  ) {
    this.getCbxAdminAccount();
  }
 
  async getOne(
    codeListName: string,
    version: CbxVersion = 'latest',
  ): Promise<CodeListDto> {
    const codeListLatest = await this.cbxHttpService.get(
      `${CBX_ENDPOINTS.GET_CODE_LIST}/name/${codeListName}`,
      this.cbxAdminAccount,
    );
 
    if (version === 'latest') {
      return this.formatCodeListResponse(codeListLatest);
    }
 
    return this.formatCodeListResponse(
      await this.cbxHttpService.get(
        `${CBX_ENDPOINTS.GET_CODE_LIST}/${codeListLatest.refNo}/${version}`,
        this.cbxAdminAccount,
      ),
    );
  }
 
  formatCodeListResponse({
    name: cbxCodeListName,
    version,
    referenceDataList,
  }: CodeListCbxResponseDto): CodeListDto {
    return {
      cbxCodeListName,
      version,
      data: referenceDataList.map(({ id, code, name, isDisabled }) => ({
        id,
        code,
        name,
        isDisabled: isDisabled ? true : false,
      })),
    };
  }
 
  async getMultipleCodeLists(names: string[], user: User) {
    const cacheKey = this.generateCacheKey(names, user);
    const cachedResponse = await this.cacheService.get(cacheKey);
 
    if (cachedResponse) {
      Logger.log(`Cache hit for key: ${cacheKey}`);
      return cachedResponse;
    }
 
    Logger.log(`Cache miss for key: ${cacheKey}. Fetching from CBX...`);
 
    // const cbxAdminAccount = await this.getCbxAdminAccount();
    // Logger.log(
    //   `Cbx admin account in codelist service: ${JSON.stringify(
    //     cbxAdminAccount,
    //   )}`,
    // );
    // Logger.log(`User in codelist service: ${JSON.stringify(user)}`);
    // user.cbxAccount = cbxAdminAccount;
    // Logger.log(`User with cbx admin account: ${JSON.stringify(user)}`);
 
    const mappedNames = names.map((name) => CODE_LIST_NAME_MAPPINGS[name]);
    const cbxUrl = `${
      CBX_ENDPOINTS.GET_CODE_LIST
    }?filterByDisable=true&names=${mappedNames.join(',')}`;
 
    Logger.log(`Sending request to CBX: ${cbxUrl}`);
 
    try {
      const cbxCodeListResponse = await this.cbxHttpService.get(
        cbxUrl,
        this.cbxAdminAccount,
      );
 
      Logger.log(
        `CodeLists Response from CBX: ${JSON.stringify(cbxCodeListResponse)}`,
      );
 
      const resultSet = this.formatMultipleCodeListResponse(
        mappedNames,
        cbxCodeListResponse,
        user,
      );
 
      const codeListResponse = { status: 'success', resultSet };
 
      await this.cacheService.set(cacheKey, codeListResponse, 3600);
 
      return codeListResponse;
    } catch (error) {
      Logger.error(`Error retrieving code lists: ${error.message}`);
      if (error.response && error.response.status === 404) {
        throw new BadRequestException('Invalid JSON Data');
      } else {
        throw new HttpException(
          'Something went wrong',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }
 
  async getCbxAdminAccount() {
    const adminUsername = this.configService.get<string>(
      'CBX_ADMIN_API_USERNAME',
    );
    Logger.log(`Fetching CBX account for admin username: ${adminUsername}`);
    const cbxAccount = await this.cbxAccountRepository.findOne({
      where: { username: adminUsername },
    });
    if (!cbxAccount) {
      throw new Error(`CBX account with username ${adminUsername} not found`);
    }
    this.cbxAdminAccount = cbxAccount;
  }
 
  private formatMultipleCodeListResponse(
    names: string[],
    responseData: any,
    user: User,
  ): MultipleCodeListDto[] {
    return names.map((name) => {
      let data: ReferenceDataDto[] =
        responseData[name]?.referenceDataList.map((item: any) => ({
          id: item.id,
          code: item.code,
          name: item.name,
        })) || [];
 
      if (name === 'LASIA_QA_LAB' && user.labCode) {
        data = data.filter((item) => item.code.startsWith(user.labCode));
      }
 
      return {
        name: name,
        version: responseData[name]?.version.toString(),
        data: data,
      };
    });
  }
 
  generateCacheKey(names: string[], user: User): string {
    const userId = user.id;
    const namesKey = names.join('_');
    return `${userId}_${namesKey}`;
  }
}


-----------------------

import { Test, TestingModule } from '@nestjs/testing';
import { CodeListService } from './codeList.service';
import { CbxHttpService } from '../../providers/cbxHttpService/cbxHttp.service';
import { CacheService } from '@providers/cache/cache.service';
import { Repository } from 'typeorm';
import { CbxAccount } from '@modules/aclAuth/entities/CbxAccount.entity';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@modules/aclAuth/entities/User.entity';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

jest.mock('../../providers/cbxHttpService/cbxHttp.service');
jest.mock('@providers/cache/cache.service');

describe('CodeListService', () => {
  let service: CodeListService;
  let cbxHttpService: CbxHttpService;
  let cacheService: CacheService;
  let configService: ConfigService;
  let cbxAccountRepository: Repository<CbxAccount>;

  const mockCbxHttpService = {
    get: jest.fn(),
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockCbxAccountRepository = {
    findOne: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('adminUser'),
  };

  const mockUser: User = {
    id: 1,
    username: 'testUser',
    cbxAccount: {} as CbxAccount,
    labCode: 'LAB123',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeListService,
        { provide: CbxHttpService, useValue: mockCbxHttpService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRepositoryToken(CbxAccount, 'aclDbConnection'), useValue: mockCbxAccountRepository },
      ],
    }).compile();

    service = module.get<CodeListService>(CodeListService);
    cbxHttpService = module.get<CbxHttpService>(CbxHttpService);
    cacheService = module.get<CacheService>(CacheService);
    configService = module.get<ConfigService>(ConfigService);
    cbxAccountRepository = module.get<Repository<CbxAccount>>(getRepositoryToken(CbxAccount, 'aclDbConnection'));
  });

  describe('getOne', () => {
    it('should return formatted response for the latest version', async () => {
      const mockResponse = { refNo: '123', name: 'TestList', version: '1', referenceDataList: [] };
      cbxHttpService.get.mockResolvedValue(mockResponse);

      const result = await service.getOne('TestList');
      expect(result).toEqual({
        cbxCodeListName: 'TestList',
        version: '1',
        data: [],
      });
    });

    it('should return formatted response for a specific version', async () => {
      const mockLatestResponse = { refNo: '123', name: 'TestList', version: '1', referenceDataList: [] };
      const mockVersionedResponse = { name: 'TestList', version: '2', referenceDataList: [] };

      cbxHttpService.get.mockResolvedValueOnce(mockLatestResponse);
      cbxHttpService.get.mockResolvedValueOnce(mockVersionedResponse);

      const result = await service.getOne('TestList', '2');
      expect(result).toEqual({
        cbxCodeListName: 'TestList',
        version: '2',
        data: [],
      });
    });
  });

  describe('getMultipleCodeLists', () => {
    it('should return cached response if available', async () => {
      const mockCacheData = { status: 'success', resultSet: [] };
      cacheService.get.mockResolvedValue(mockCacheData);

      const result = await service.getMultipleCodeLists(['TestList'], mockUser);
      expect(cacheService.get).toHaveBeenCalled();
      expect(result).toEqual(mockCacheData);
    });

    it('should fetch data from CBX and store in cache if not cached', async () => {
      cacheService.get.mockResolvedValue(null);
      cbxHttpService.get.mockResolvedValue({ TestList: { version: '1', referenceDataList: [] } });

      const result = await service.getMultipleCodeLists(['TestList'], mockUser);

      expect(cbxHttpService.get).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 3600);
      expect(result).toHaveProperty('status', 'success');
    });

    it('should throw BadRequestException for a 404 error', async () => {
      cacheService.get.mockResolvedValue(null);
      cbxHttpService.get.mockRejectedValue({ response: { status: 404 }, message: 'Not Found' });

      await expect(service.getMultipleCodeLists(['InvalidList'], mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw HttpException for other errors', async () => {
      cacheService.get.mockResolvedValue(null);
      cbxHttpService.get.mockRejectedValue(new Error('Some error'));

      await expect(service.getMultipleCodeLists(['TestList'], mockUser)).rejects.toThrow(HttpException);
    });
  });

  describe('getCbxAdminAccount', () => {
    it('should fetch the CBX admin account successfully', async () => {
      const mockAdminAccount = { username: 'adminUser' } as CbxAccount;
      mockCbxAccountRepository.findOne.mockResolvedValue(mockAdminAccount);

      await service.getCbxAdminAccount();
      expect(cbxAccountRepository.findOne).toHaveBeenCalledWith({ where: { username: 'adminUser' } });
      expect(service['cbxAdminAccount']).toEqual(mockAdminAccount);
    });

    it('should throw an error if CBX admin account is not found', async () => {
      mockCbxAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.getCbxAdminAccount()).rejects.toThrow(Error);
    });
  });

  describe('formatCodeListResponse', () => {
    it('should format the code list response correctly', () => {
      const mockResponse = {
        name: 'TestList',
        version: '1',
        referenceDataList: [
          { id: 1, code: 'A1', name: 'Item A', isDisabled: false },
          { id: 2, code: 'B1', name: 'Item B', isDisabled: true },
        ],
      };

      const result = service.formatCodeListResponse(mockResponse);
      expect(result).toEqual({
        cbxCodeListName: 'TestList',
        version: '1',
        data: [
          { id: 1, code: 'A1', name: 'Item A', isDisabled: false },
          { id: 2, code: 'B1', name: 'Item B', isDisabled: true },
        ],
      });
    });
  });

  describe('generateCacheKey', () => {
    it('should generate a cache key based on user ID and code list names', () => {
      const result = service.generateCacheKey(['TestList', 'AnotherList'], mockUser);
      expect(result).toBe('1_TestList_AnotherList');
    });
  });
});

------------------------------------------------ errors -------------------------------------------------------

  Property 'mockResolvedValueOnce' does not exist on type '(url: string, cbxAccount?: CbxAccount, retryCount?: number) => Promise<any>'.

 
