import { User } from '@modules/aclAuth/entities/User.entity';
import { IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class IncomingRequestDto {
  user: User;

  @IsNotEmpty()
  @IsString()
  method: string;

  @IsNotEmpty()
  @IsString()
  url: string;

  @IsOptional()
  @IsObject()
  request_body: any;

  @IsOptional()
  @IsString()
  response_status: string;

  @IsOptional()
  @IsString()
  error_message: string;
}
