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

const { TVM } = require('../../lib/TVM')

const openwhisk = require('openwhisk')
jest.mock('openwhisk')

const fakeParams = {
  expirationDuration: '1500',
  whitelist: '*',
  owApihost: 'https://www.fake.com',
  owNamespace: 'fakeNS',
  __ow_headers: { authorization: 'fakeAuth' }
}

describe('processRequest (abstract)', () => {
  // setup
  /** @type {TVM} */
  let tvm
  const owNsListMock = jest.fn()
  openwhisk.mockReturnValue({
    namespaces: {
      list: owNsListMock
    }
  })
  console.error = jest.fn()
  console.warn = jest.fn()
  console.log = jest.fn()
  beforeEach(() => {
    tvm = new TVM()
    console.log.mockReset()
    console.warn.mockReset()
    console.error.mockReset()
    owNsListMock.mockReset()
    owNsListMock.mockResolvedValue([fakeParams.owNamespace])
  })

  test('without implementation', async () => {
    const response = await tvm.processRequest(fakeParams)
    expect(response.body.error).toBeDefined()
    expect(response.statusCode).toEqual(500)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('not implemented'))
  })

  describe('with a mock implementation', () => {
    const mockResponse = {
      a: 'field',
      another: { 'important': { 'value': 1 } }
    }
    beforeEach(() => {
      tvm._generateCredentials = jest.fn()
      tvm._generateCredentials.mockResolvedValue(mockResponse)
    })

    describe('param validation', () => {
      const testParam = async (key, value, status) => {
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

      test('when a non expected param is there', async () => testParam('non__expected__param', 'hello'))
      test('when a non expected param starts with `__ow*` (allowed)', async () => testParam('__ow_param', 'hello', 200))
      test('when a non expected param has an empty key "", (allowed)', async () => testParam('', 'hello', 200))

      test('when expirationDuration is missing', async () => testParam('expirationDuration', undefined))
      test('when expirationDuration is not parseInt string', async () => testParam('expirationDuration', 'hello'))
      test('when whitelist is missing', async () => testParam('whitelist', undefined)) // TODO more checks on whitelist format
      test('when owApihost is missing', async () => testParam('owApihost', undefined))
      test('when owApihost is not a valid uri', async () => testParam('owApihost', 'hello'))
      test('when owNamespace is missing', async () => testParam('owNamespace', undefined))

      test('when authorization header is missing', async () => testParam('__ow_headers.authorization', undefined, 401))
    })
  })
})
