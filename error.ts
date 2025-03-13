Property 'mockResolvedValue' does not exist on type '(ian: string, request: any, source?: string) => Promise<QueueMessage>'.


  Argument of type '{ request_body: {}; }' is not assignable to parameter of type 'IncomingRequestDto'.
  Type '{ request_body: {}; }' is missing the following properties from type 'IncomingRequestDto': user, method, url, response_status, error_messagets

Property 'mockRejectedValue' does not exist on type '(data: any) => Promise<void>'.

  Argument of type '{ request_body: {}; }' is not assignable to parameter of type 'IncomingRequestDto'.
  Type '{ request_body: {}; }' is missing the following properties from type 'IncomingRequestDto': user, method, url, response_status, error_message

Property 'mockResolvedValue' does not exist on type '(queueMessage: any) => Promise<any>'.


  Type 'number' is not assignable to type 'string'.ts(2322)
queueMessage.entity.ts(14, 3): The expected type comes from property 'id' which is declared here on type 'QueueMessage'


No overload matches this call.
  Overload 1 of 4, '(object: LabTestService, method: never, accessType: "get"): SpyInstance<never, []>', gave the following error.
    Argument of type '"logger"' is not assignable to parameter of type 'never'.
  Overload 2 of 4, '(object: LabTestService, method: never, accessType: "set"): SpyInstance<void, [never]>', gave the following error.
    Argument of type '"logger"' is not assignable to parameter of type 'never'.


  Argument of type '{ log: jest.Mock<any, any>; }' is not assignable to parameter of type 'never'.

  
