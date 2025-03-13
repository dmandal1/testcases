import { Test, TestingModule } from '@nestjs/testing';
import { CodeListService } from './codeList.service';
import { CbxHttpService } from '../../providers/cbxHttpService/cbxHttp.service';
import { CacheService } from '@providers/cache/cache.service';
import { Repository } from 'typeorm';
import { CbxAccount } from '@modules/aclAuth/entities/CbxAccount.entity';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '@modules/aclAuth/entities/User.entity';
import { BadRequestException, HttpException } from '@nestjs/common';

jest.mock('../../providers/cbxHttpService/cbxHttp.service');
jest.mock('@providers/cache/cache.service');
jest.mock('@nestjs/config');

describe('CodeListService', () => {
  let service: CodeListService;
  let cbxHttpService: jest.Mocked<CbxHttpService>;
  let cacheService: jest.Mocked<CacheService>;
  let configService: jest.Mocked<ConfigService>;
  let cbxAccountRepository: jest.Mocked<Repository<CbxAccount>>;

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
        {
          provide: CbxHttpService,
          useValue: {
            get: jest.fn(),
            post: jest.fn(),
            patch: jest.fn(),
            getAccessToken: jest.fn(),
            getHealth: jest.fn(),
            getResponse: jest.fn(),
          } as jest.Mocked<CbxHttpService>,
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          } as jest.Mocked<CacheService>,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('adminUser'),
          } as jest.Mocked<ConfigService>,
        },
        {
          provide: getRepositoryToken(CbxAccount, 'aclDbConnection'),
          useValue: {
            findOne: jest.fn(),
          } as jest.Mocked<Repository<CbxAccount>>,
        },
      ],
    }).compile();

    service = module.get<CodeListService>(CodeListService);
    cbxHttpService = module.get(CbxHttpService);
    cacheService = module.get(CacheService);
    configService = module.get(ConfigService);
    cbxAccountRepository = module.get(getRepositoryToken(CbxAccount, 'aclDbConnection'));
  });

  describe('getOne', () => {
    it('should return formatted response for the latest version', async () => {
      const mockResponse = { refNo: '123', name: 'TestList', version: '1', referenceDataList: [] };
      cbxHttpService.get.mockResolvedValueOnce(mockResponse);

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
      cacheService.get.mockResolvedValueOnce(mockCacheData);

      const result = await service.getMultipleCodeLists(['TestList'], mockUser);
      expect(cacheService.get).toHaveBeenCalled();
      expect(result).toEqual(mockCacheData);
    });

    it('should fetch data from CBX and store in cache if not cached', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      cbxHttpService.get.mockResolvedValueOnce({ TestList: { version: '1', referenceDataList: [] } });

      const result = await service.getMultipleCodeLists(['TestList'], mockUser);

      expect(cbxHttpService.get).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), 3600);
      expect(result).toHaveProperty('status', 'success');
    });

    it('should throw BadRequestException for a 404 error', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      cbxHttpService.get.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not Found' });

      await expect(service.getMultipleCodeLists(['InvalidList'], mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw HttpException for other errors', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      cbxHttpService.get.mockRejectedValueOnce(new Error('Some error'));

      await expect(service.getMultipleCodeLists(['TestList'], mockUser)).rejects.toThrow(HttpException);
    });
  });

  describe('getCbxAdminAccount', () => {
    it('should fetch the CBX admin account successfully', async () => {
      const mockAdminAccount = { username: 'adminUser' } as CbxAccount;
      cbxAccountRepository.findOne.mockResolvedValueOnce(mockAdminAccount);

      await service.getCbxAdminAccount();
      expect(cbxAccountRepository.findOne).toHaveBeenCalledWith({ where: { username: 'adminUser' } });
      expect(service['cbxAdminAccount']).toEqual(mockAdminAccount);
    });

    it('should throw an error if CBX admin account is not found', async () => {
      cbxAccountRepository.findOne.mockResolvedValueOnce(null);

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