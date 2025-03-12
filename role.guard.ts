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
