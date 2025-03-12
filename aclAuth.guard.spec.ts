import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AclAuthGuard } from './acl-auth.guard';
import { AclAuthService } from '@modules/aclAuth/aclAuth.service';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from 'src/common/interceptors/request-context.service';
import { EncryptionService } from '@modules/utils/encryption/encryption.service';
import { ERROR_INVALID_LKA_API_KEY } from 'src/common/constants/errorMessage';
import { X_LKA_API_KEY } from 'src/common/constants/common';
import { User } from '@modules/aclAuth/entities/User.entity';

describe('AclAuthGuard', () => {
  let aclAuthGuard: AclAuthGuard;
  let aclAuthService: jest.Mocked<AclAuthService>;
  let reflector: jest.Mocked<Reflector>;
  let requestContextService: jest.Mocked<RequestContextService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let executionContext: jest.Mocked<ExecutionContext>;

  beforeEach(() => {
    aclAuthService = {
      validateApiKey: jest.fn(),
      getUserFromApiKey: jest.fn(),
      getUserRoles: jest.fn(),
    } as any;

    reflector = {
      get: jest.fn(),
    } as any;

    requestContextService = {
      setUser: jest.fn(),
    } as any;

    encryptionService = {
      encrypt: jest.fn(),
    } as any;

    aclAuthGuard = new AclAuthGuard(
      aclAuthService,
      reflector,
      requestContextService,
      encryptionService,
    );

    executionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as any;
  });

  it('should allow access if method has no ACL auth', async () => {
    reflector.get.mockReturnValue(true);
    const canActivate = await aclAuthGuard.canActivate(executionContext);
    expect(canActivate).toBe(true);
  });

  it('should allow access if class has no ACL auth', async () => {
    reflector.get.mockImplementation((key) =>
      key === AclAuthGuard.noAuthKey ? true : false,
    );
    const canActivate = await aclAuthGuard.canActivate(executionContext);
    expect(canActivate).toBe(true);
  });

  it('should throw UnauthorizedException if API key is missing', async () => {
    const request = { headers: {} };
    executionContext.switchToHttp().getRequest.mockReturnValue(request);

    await expect(aclAuthGuard.canActivate(executionContext)).rejects.toThrow(
      new UnauthorizedException(ERROR_INVALID_LKA_API_KEY),
    );
  });

  it('should throw UnauthorizedException if API key is invalid', async () => {
    const request = { headers: { [X_LKA_API_KEY.toLowerCase()]: 'invalid-key' } };
    executionContext.switchToHttp().getRequest.mockReturnValue(request);
    encryptionService.encrypt.mockReturnValue('encrypted-invalid-key');
    aclAuthService.validateApiKey.mockResolvedValue(false);

    await expect(aclAuthGuard.canActivate(executionContext)).rejects.toThrow(
      new UnauthorizedException(ERROR_INVALID_LKA_API_KEY),
    );
  });

  it('should allow access and set user context if API key is valid', async () => {
    const request = { headers: { [X_LKA_API_KEY.toLowerCase()]: 'valid-key' } };
    executionContext.switchToHttp().getRequest.mockReturnValue(request);
    
    encryptionService.encrypt.mockReturnValue('encrypted-valid-key');
    aclAuthService.validateApiKey.mockResolvedValue(true);
    
    const mockUser = { id: 1, name: 'Test User' } as User;
    const mockRoles = ['admin'];
    
    aclAuthService.getUserFromApiKey.mockResolvedValue(mockUser);
    aclAuthService.getUserRoles.mockResolvedValue(mockRoles);
    
    const canActivate = await aclAuthGuard.canActivate(executionContext);
    
    expect(canActivate).toBe(true);
    expect(aclAuthService.getUserFromApiKey).toHaveBeenCalledWith('encrypted-valid-key');
    expect(aclAuthService.getUserRoles).toHaveBeenCalledWith(mockUser.id);
    expect(request.user).toBe(mockUser);
    expect(request.roles).toBe(mockRoles);
    expect(requestContextService.setUser).toHaveBeenCalledWith(mockUser);
  });
});
