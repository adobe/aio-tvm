/*
Copyright 2019 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

/* eslint-disable jsdoc/require-jsdoc */
process.on('unhandledRejection', error => {
  throw error
})

global.mockLog = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}
jest.doMock('@adobe/aio-lib-core-logging', () => () => global.mockLog)

jest.mock('@adobe/aio-lib-ims', () => ({
  Ims: jest.fn()
}))
global.Ims = require('@adobe/aio-lib-ims').Ims
global.mockImsInstance = { validateToken: jest.fn() }
global.Ims.mockImplementation(() => global.mockImsInstance)
global.imsValidateTokenResponseNoError = {
  valid: true,
  token: {
    client_id: 'AnsApiPlatform1',
    scope: 'AdobeID,openid,system'
  }
}

jest.mock('lru-cache')
global.LRU = require('lru-cache')
global.mockLRUInstance = {
  get: jest.fn(),
  set: jest.fn()
}
global.LRU.mockImplementation(() => global.mockLRUInstance)

global.fakeGWToken = 'fakeGWToken'
global.fakeAuth = 'fakeauth'
global.owNsListMock = jest.fn()
global.baseNoErrorParams = {
  expirationDuration: '1500',
  approvedList: '*',
  owApihost: 'https://www.fake.com',
  owNamespace: 'fakeNS',
  __ow_headers: {
    authorization: 'Basic ZmFrZWF1dGg=', // 'fakeauth' in base64
    'x-gw-ims-authorization': 'Bearer ' + global.fakeGWToken
  }
}
global.nsHash = 'f3125a324ac7d2024dbbc867fb2e6013'

const openwhisk = require('openwhisk')
jest.mock('openwhisk')

openwhisk.mockReturnValue({
  namespaces: {
    list: global.owNsListMock
  }
})

/* helper for param validation */
global.testParam = async (tvm, fakeParams, key, value, status) => {
  const testParams = JSON.parse(JSON.stringify(fakeParams))

  const keys = key.split('.')
  const lastKey = keys.pop()
  const traverse = keys.reduce((prev, curr) => prev[curr], testParams)

  if (value === undefined) delete traverse[lastKey]
  else traverse[lastKey] = value
  const response = await tvm.processRequest(testParams)

  expect(response.statusCode).toEqual(status || 400)
  if (status >= 400) {
    expect(response.body.error).toBeDefined()
    expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining(lastKey))
  }
  // here no need to test for 500s responses (which should be wrapped in {error}) because missing param should always be a 40x
}

beforeEach(() => {
  expect.hasAssertions()
  global.mockLog.info.mockReset()
  global.mockLog.warn.mockReset()
  global.mockLog.error.mockReset()

  global.owNsListMock.mockReset()

  // default: valid OW namespace
  global.owNsListMock.mockResolvedValue([global.baseNoErrorParams.owNamespace])
  // default assume gw ims token ok
  global.Ims.mockClear()
  global.mockImsInstance.validateToken.mockReset()
  global.mockImsInstance.validateToken.mockResolvedValue(global.imsValidateTokenResponseNoError)
  global.mockImsInstance.validateToken.mockResolvedValue(global.imsValidateTokenResponseNoError)
  global.LRU.mockClear()
  global.mockLRUInstance.get.mockReset()
  global.mockLRUInstance.set.mockReset()
})

global.expectUnauthorized = (response, log) => {
  expect(response.statusCode).toEqual(403)
  expect(response.body.error).toEqual(expect.stringContaining('unauthorized'))
  expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining(log))
}

global.expect500Error = (response, log) => {
  expect(response.statusCode).toEqual(500)
  expect(response.body.error).toEqual(expect.stringContaining('server error'))
  expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining(log))
}

global.expectServerError = (response, log) => {
  if (!response.error) {
    throw new Error(`expected 500 error got: ${JSON.stringify(response)}`)
  }
  expect(response.error.statusCode).toEqual(500)
  expect(response.error.body.error).toEqual(expect.stringContaining('server error'))
  expect(global.mockLog.error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(log) }))
}
