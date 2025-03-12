import { CBX_ENDPOINTS } from '@constants';
import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getExpiryDateTime, isExpired } from '@utils';
import { AxiosResponse } from 'axios';
import {
  catchError,
  firstValueFrom,
  map,
  Observable,
  retry,
  throwError,
} from 'rxjs';
import { CacheService } from '@cache';
import { RequestContextService } from 'src/common/interceptors/request-context.service';
import { EncryptionService } from '@modules/utils/encryption/encryption.service';
import { CbxAccount } from '@modules/aclAuth/entities/CbxAccount.entity';

@Injectable()
export class CbxHttpService {
  private readonly baseUrl: string;
  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
    private readonly requestContextService: RequestContextService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.baseUrl = this.configService.get('CBX_DOMAIN');
  }

  private async _renewToken(cbxAccount: CbxAccount = undefined) {
    const tokenInfo: any = await this.getAccessToken(cbxAccount);

    const expireAt = getExpiryDateTime({ seconds: tokenInfo.expires_in - 10 });
    const token = tokenInfo.access_token;

    Logger.log('Renew token expire at ' + expireAt);

    await this.cacheService.set(cbxAccount.username, {
      token,
      expireAt,
    });

    return token;
  }

  private async _getToken(cbxAccount: CbxAccount = undefined) {
    const tokenInfo = await this.cacheService.get(cbxAccount.username);

    Logger.log(
      `Token isExpired: ${
        tokenInfo?.expireAt && isExpired(tokenInfo.expireAt)
      }`,
    );

    return !tokenInfo || isExpired(tokenInfo.expireAt)
      ? this._renewToken(cbxAccount)
      : tokenInfo.token;
  }

  private async _getHeader(cbxAccount: CbxAccount = undefined) {
    return {
      headers: {
        Authorization: `Bearer ${await this._getToken(cbxAccount)}`,
      },
    };
  }

  // Get API access token from CBX
  getAccessToken(cbxAccount: CbxAccount = undefined): Promise<AxiosResponse> {
    Logger.log(`CbxAccount to getAccessToken: ${JSON.stringify(cbxAccount)}`);

    const username = cbxAccount.username;
    const password = this.encryptionService.decrypt(cbxAccount.password);

    const authUser = this.configService.get('CBX_ACCESS_USERNAME');
    const authPassword = this.configService.get('CBX_ACCESS_PASSWORD');
    const cbxTokenEndpoint = `${this.baseUrl}/${CBX_ENDPOINTS.GET_OAUTH_TOKEN}`;

    return new Promise((resolve, reject) =>
      this.httpService
        .post(
          cbxTokenEndpoint,
          {},
          {
            auth: { username: authUser, password: authPassword },
            params: { grant_type: 'password', username, password },
          },
        )
        .subscribe({
          next: ({ data }: any) => resolve(data),
          error: (err: any) =>
            reject(new HttpException(err.response?.data, err.response?.status)),
        }),
    );
  }

  private _postProcessResponse(
    obs$: Observable<AxiosResponse>,
    retryCount: number,
  ): Promise<any> {
    return new Promise((resolve, reject) =>
      obs$
        .pipe(
          map((res: any) => {
            // Check if status is 201 and response body is empty - to handle file upload api
            if (res.status === 201 && !res.data) {
              console.log('-----------inside upload file scnario')
              return {
                data: null,
                status: res.status,
                message: 'Successfully processed but response body is empty.',
              };
            }
            return res.data; // for 200 status return the res.data
          }),
          retry(retryCount),
          catchError((err) =>
            throwError(() => {
              if (!err.response) {
                const unreachableError = {
                  response: { data: 'Service is unreachable', status: null },
                };
                Logger.error(unreachableError.response);
                return unreachableError;
              }

              const { response } = err || {};
              const { data, status } = response || {};
              Logger.error({ data, status });
              return { response: { data, status } };
            }),
          ),
        )
        .subscribe({
          next: (data) => resolve(data),
          error: (err) => reject(err),
        }),
    );
  }

  async get(
    url: string,
    cbxAccount: CbxAccount = undefined,
    retryCount = 0,
  ): Promise<AxiosResponse['data']> {
    const header =
      url !== CBX_ENDPOINTS.GET_HEALTH_STATUS
        ? await this._getHeader(cbxAccount)
        : {};
    return this._postProcessResponse(
      this.httpService.get(`${this.baseUrl}/${url}`, header),
      retryCount,
    );
  }

  async getHealth(url: string, retryCount = 0): Promise<AxiosResponse['data']> {
    return this._postProcessResponse(
      this.httpService.get(`${this.baseUrl}/${url}`),
      retryCount,
    );
  }

  async getResponse(url: string): Promise<AxiosResponse> {
    const header = await this._getHeader();
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/${url}`, header),
    );
    return response;
  }

  async post(
    url: string,
    cbxAccount: CbxAccount,
    data: any,
    config: any = {},
    retryCount = 0,
  ): Promise<AxiosResponse['data']> {
    let header = await this._getHeader(cbxAccount);
    header = Object.keys(config).length > 0 ? header : {...header,
      ...config};
    return this._postProcessResponse(
      this.httpService.post(`${this.baseUrl}/${url}`, data, header),
      retryCount,
    );
  }

  async patch(
    url: string,
    data: any,
    retryCount = 0,
  ): Promise<AxiosResponse['data']> {
    const header = await this._getHeader();
    return this._postProcessResponse(
      this.httpService.patch(`${this.baseUrl}/${url}`, data, header),
      retryCount,
    );
  }
}
