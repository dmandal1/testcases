Type 'CbxHttpService' is not assignable to type 'Mocked<CbxHttpService>'.
  Type 'CbxHttpService' is not assignable to type '{ getAccessToken: MockInstance<Promise<AxiosResponse<any, any>>, [cbxAccount?: CbxAccount]>; get: MockInstance<Promise<any>, [url: string, cbxAccount?: CbxAccount, retryCount?: number]>; getHealth: MockInstance<...>; getResponse: MockInstance<...>; post: MockInstance<...>; patch: MockInstance<...>; }'.
    Types of property 'getAccessToken' are incompatible.
      Type '(cbxAccount?: CbxAccount) => Promise<AxiosResponse<any, any>>' is not assignable to type 'MockInstance<Promise<AxiosResponse<any, any>>, [cbxAccount?: CbxAccount]>'.
