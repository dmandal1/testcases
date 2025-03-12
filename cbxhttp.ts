import { Test, TestingModule } from '@nestjs/testing';
import { CbxHttpService } from './cbx-http.service';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '@cache';
import { HttpService } from '@nestjs/axios';
import { RequestContextService } from 'src/common/interceptors/request-context.service';
import { EncryptionService } from '@modules/utils/encryption/encryption.service';
import { CbxAccount } from '@modules/aclAuth/entities/CbxAccount.entity';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';

describe('CbxHttpService', () => {
  let service: CbxHttpService;
  let httpService: HttpService;
  let cacheService: CacheService;
  let configService: ConfigService;
  let encryptionService: EncryptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CbxHttpService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              if (key === 'CBX_DOMAIN') return 'https://cbx.api.com';
              if (key === 'CBX_ACCESS_USERNAME') return 'testUser';
              if (key === 'CBX_ACCESS_PASSWORD') return 'testPassword';
              return null;
            }),
          },
        },
        {
          provide: CacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
            patch: jest.fn(),
          },
        },
        {
          provide: RequestContextService,
          useValue: {},
        },
        {
          provide: EncryptionService,
          useValue: {
            decrypt: jest.fn().mockReturnValue('decryptedPassword'),
          },
        },
      ],
    }).compile();

    service = module.get<CbxHttpService>(CbxHttpService);
    httpService = module.get<HttpService>(HttpService);
    cacheService = module.get<CacheService>(CacheService);
    configService = module.get<ConfigService>(ConfigService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('_renewToken', () => {
    it('should renew token and cache it', async () => {
      const cbxAccount: CbxAccount = { username: 'user', password: 'encrypted' } as CbxAccount;

      jest.spyOn(service, 'getAccessToken').mockResolvedValue({
        access_token: 'newToken',
        expires_in: 3600,
      });

      await service['_renewToken'](cbxAccount);

      expect(cacheService.set).toHaveBeenCalledWith('user', {
        token: 'newToken',
        expireAt: expect.any(String),
      });
    });
  });

  describe('getAccessToken', () => {
    it('should return access token successfully', async () => {
      const cbxAccount: CbxAccount = { username: 'testUser', password: 'encrypted' } as CbxAccount;

      const response: AxiosResponse = {
        data: { access_token: 'mockToken', expires_in: 3600 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };

      jest.spyOn(httpService, 'post').mockReturnValue(of(response));

      const result = await service.getAccessToken(cbxAccount);

      expect(result).toEqual({ access_token: 'mockToken', expires_in: 3600 });
    });

    it('should throw an error when request fails', async () => {
      const cbxAccount: CbxAccount = { username: 'testUser', password: 'encrypted' } as CbxAccount;

      jest.spyOn(httpService, 'post').mockReturnValue(
        throwError(() => ({
          response: { data: 'Error', status: 401 },
        })),
      );

      await expect(service.getAccessToken(cbxAccount)).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should return data from GET request', async () => {
      const url = 'test-endpoint';
      const cbxAccount: CbxAccount = { username: 'testUser', password: 'encrypted' } as CbxAccount;

      const response: AxiosResponse = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };

      jest.spyOn(service as any, '_getHeader').mockResolvedValue({
        headers: { Authorization: 'Bearer mockToken' },
      });

      jest.spyOn(httpService, 'get').mockReturnValue(of(response));

      const result = await service.get(url, cbxAccount);

      expect(result).toEqual({ success: true });
    });
  });

  describe('post', () => {
    it('should send a POST request and return data', async () => {
      const url = 'test-endpoint';
      const cbxAccount: CbxAccount = { username: 'testUser', password: 'encrypted' } as CbxAccount;
      const data = { key: 'value' };

      const response: AxiosResponse = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };

      jest.spyOn(service as any, '_getHeader').mockResolvedValue({
        headers: { Authorization: 'Bearer mockToken' },
      });

      jest.spyOn(httpService, 'post').mockReturnValue(of(response));

      const result = await service.post(url, cbxAccount, data);

      expect(result).toEqual({ success: true });
    });
  });

  describe('patch', () => {
    it('should send a PATCH request and return data', async () => {
      const url = 'test-endpoint';
      const data = { key: 'value' };

      const response: AxiosResponse = {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      };

      jest.spyOn(service as any, '_getHeader').mockResolvedValue({
        headers: { Authorization: 'Bearer mockToken' },
      });

      jest.spyOn(httpService, 'patch').mockReturnValue(of(response));

      const result = await service.patch(url, data);

      expect(result).toEqual({ success: true });
    });
  });
});