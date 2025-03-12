import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AclAuthService } from '@modules/aclAuth/aclAuth.service';
import { ERROR_NO_PERMISSION } from 'src/common/constants/errorMessage';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(
    private aclAuthService: AclAuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>(
      'roles',
      context.getHandler(),
    );
    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(ERROR_NO_PERMISSION);
    }

    const userRoles = await this.aclAuthService.getUserRoles(user.id);

    const hasRole = () =>
      userRoles.some((role) => requiredRoles.includes(role));
    if (!hasRole()) {
      throw new ForbiddenException(ERROR_NO_PERMISSION);
    }
    return true;
  }
}


----------

import { RoleGuard } from './role.guard';
import { Reflector } from '@nestjs/core';
import { AclAuthService } from '@modules/aclAuth/aclAuth.service';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

describe('RoleGuard', () => {
  let roleGuard: RoleGuard;
  let aclAuthService: AclAuthService;
  let reflector: Reflector;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    aclAuthService = { getUserRoles: jest.fn() } as any;
    reflector = { get: jest.fn() } as any;
    roleGuard = new RoleGuard(aclAuthService, reflector);

    mockContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
      getHandler: jest.fn(),
    } as any;
  });

  it('should return true if no roles are required', async () => {
    (reflector.get as jest.Mock).mockReturnValue(null);
    expect(await roleGuard.canActivate(mockContext)).toBe(true);
  });

  it('should throw ForbiddenException if user is not found in request', async () => {
    (reflector.get as jest.Mock).mockReturnValue(['admin']);
    (mockContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({});

    await expect(roleGuard.canActivate(mockContext)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return true if user has required roles', async () => {
    (reflector.get as jest.Mock).mockReturnValue(['admin']);
    (mockContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
      user: { id: 1 },
    });
    (aclAuthService.getUserRoles as jest.Mock).mockResolvedValue(['admin']);

    expect(await roleGuard.canActivate(mockContext)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks required roles', async () => {
    (reflector.get as jest.Mock).mockReturnValue(['admin']);
    (mockContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
      user: { id: 1 },
    });
    (aclAuthService.getUserRoles as jest.Mock).mockResolvedValue(['user']);

    await expect(roleGuard.canActivate(mockContext)).rejects.toThrow(
      ForbiddenException,
    );
  });
});


