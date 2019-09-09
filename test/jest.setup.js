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

console.error = jest.fn()
console.warn = jest.fn()
console.log = jest.fn()

global.owNsListMock = jest.fn()
global.baseNoErrorParams = {
  expirationDuration: '1500',
  whitelist: '*',
  owApihost: 'https://www.fake.com',
  owNamespace: 'fakeNS',
  __ow_headers: { authorization: 'fakeAuth' }
}

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

  if (status !== 200) {
    expect(response.body.error).toBeDefined()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(lastKey))
  }
  expect(response.statusCode).toEqual(status || 400)
}

beforeEach(() => {
  expect.hasAssertions()

  console.log.mockReset()
  console.warn.mockReset()
  console.error.mockReset()
  global.owNsListMock.mockReset()

  // default: valid OW namespace
  global.owNsListMock.mockResolvedValue([ global.baseNoErrorParams.owNamespace ])
})

global.expectUnauthorized = (response, log) => {
  expect(response.statusCode).toEqual(403)
  expect(response.body.error).toEqual(expect.stringContaining('unauthorized'))
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(log))
}

global.expectServerError = (response, log) => {
  expect(response.statusCode).toEqual(500)
  expect(response.body.error).toEqual(expect.stringContaining('server error'))
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining(log))
}
