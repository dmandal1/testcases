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
 
