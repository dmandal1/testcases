import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AclAuthService } from '@modules/aclAuth/aclAuth.service';
import { Reflector } from '@nestjs/core';
import { RequestContextService } from 'src/common/interceptors/request-context.service';
import { EncryptionService } from '@modules/utils/encryption/encryption.service';
import { ERROR_INVALID_LKA_API_KEY } from 'src/common/constants/errorMessage';
import { X_LKA_API_KEY } from 'src/common/constants/common';
import { User } from '@modules/aclAuth/entities/User.entity';

@Injectable()
export class AclAuthGuard implements CanActivate {
  constructor(
    private readonly aclAuthService: AclAuthService,
    private readonly reflector: Reflector,
    private readonly requestContextService: RequestContextService,
    private readonly encryptionService: EncryptionService,
  ) {}
  protected static readonly noAuthKey = 'no-acl-auth';

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isMethodNoAclAuth = this.checkNoAclAuthOnMethod(context);
    const isClassNoAclAuth = this.checkNoAclAuthOnClass(context);

    if (isMethodNoAclAuth || isClassNoAclAuth) return true;

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers[X_LKA_API_KEY.toLowerCase()];

    if (!apiKey) {
      throw new UnauthorizedException(ERROR_INVALID_LKA_API_KEY);
    }

    const encryptedKey = this.encryptionService.encrypt(apiKey);

    const isValid = await this.aclAuthService.validateApiKey(encryptedKey);

    if (isValid) {
      const user: User = await this.aclAuthService.getUserFromApiKey(
        encryptedKey,
      );
      const roles = await this.aclAuthService.getUserRoles(user.id);
      request.roles = roles;
      request.user = user;
      this.requestContextService.setUser(user);
      return true;
    }

    throw new UnauthorizedException(ERROR_INVALID_LKA_API_KEY);
  }

  protected checkNoAclAuthOnMethod(context: ExecutionContext): boolean {
    return this.reflector.get<boolean>(
      AclAuthGuard.noAuthKey,
      context.getHandler(),
    );
  }

  protected checkNoAclAuthOnClass(context: ExecutionContext): boolean {
    return this.reflector.get<boolean>(
      AclAuthGuard.noAuthKey,
      context.getClass(),
    );
  }
}
