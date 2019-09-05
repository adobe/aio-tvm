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
  beforeEach(() => {
    tvm = new TVM()
    console.log.mockReset()
    console.warn.mockReset()
    console.error.mockReset()
    owNsListMock.mockReset()
    owNsListMock.mockResolvedValue([fakeParams.owNamespace])
  })

  const expectUnauthorized = (response, message) => {
    expect(response.statusCode).toEqual(403)
    expect(response.body.error).toEqual(expect.stringContaining('unauthorized'))
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(message))
  }

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
      test('when whitelist is missing', async () => testParam('whitelist', undefined))
      test('when whitelist is empty', async () => testParam('whitelist', ''))
      test('when owApihost is missing', async () => testParam('owApihost', undefined))
      test('when owApihost is not a valid uri', async () => testParam('owApihost', 'hello'))
      test('when owNamespace is missing', async () => testParam('owNamespace', undefined))
      test('when owNamespace is empty', async () => testParam('owNamespace', ''))

      test('when authorization header is missing', async () => testParam('__ow_headers.authorization', undefined, 401))
      test('when authorization header is empty', async () => testParam('__ow_headers.authorization', '', 401))
    })

    describe('openwhisk namespace/auth validation', () => {
      test('when openwhisk.namespaces.list throws an error', async () => {
        const errorMsg = 'abfjdsjfhbv'
        owNsListMock.mockRejectedValue(new Error(errorMsg))
        const response = await tvm.processRequest(fakeParams)
        expectUnauthorized(response, errorMsg)
      })
      test('when openwhisk.namespaces.list returns with an empty list', async () => {
        owNsListMock.mockResolvedValue([])
        const response = await tvm.processRequest(fakeParams)
        expectUnauthorized(response, '[]')
      })
      test('when openwhisk.namespaces.list returns with a list not containing the namespace', async () => {
        owNsListMock.mockResolvedValue(['notinthelist'])
        const response = await tvm.processRequest(fakeParams)
        expectUnauthorized(response, '[notinthelist]')
      })
      test('when openwhisk.namespaces.list returns with a list containing only the namespace (authorized)', async () => {
        owNsListMock.mockResolvedValue([fakeParams.owNamespace])
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
      })
      test('when openwhisk.namespaces.list returns with a list containing the namespace and others (authorized)', async () => {
        owNsListMock.mockResolvedValue([fakeParams.owNamespace, 'otherNS', 'otherNS2'])
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
      })
    })

    describe('namespace whitelist validation', () => {
      const testWhitelist = async (whitelist, expectedAuthorized) => {
        const testParams = { ...fakeParams }
        testParams.whitelist = whitelist
        const response = await tvm.processRequest(testParams)
        if (expectedAuthorized) return expect(response.statusCode).toEqual(200)
        return expectUnauthorized(response, 'not whitelisted')
      }

      test('when whitelist contains only another namespace', async () => testWhitelist('anotherNS', false))
      test('when whitelist contains a list of different namespaces', async () => testWhitelist(',anotherNS, anotherNS2,anotherNS3 ,anotherNS4 ,', false))
      test('when whitelist contains a namespace which shares the same prefix', async () => testWhitelist(`${fakeParams.owNamespace}-`, false))
      test('when whitelist contains a namespace which shares the same suffix', async () => testWhitelist(`-${fakeParams.owNamespace}`, false))
      test('when whitelist contains a namespace which shares the same prefix and escape chars', async () => testWhitelist(`\\-${fakeParams.owNamespace}`, false))
      test('when whitelist contains a namespace which shares the same suffix and escape chars', async () => testWhitelist(`${fakeParams.owNamespace}\\-`, false))
      test('when whitelist contains a list of different namespaces with symbols (including stars!) and same suffix/prefix', async () => testWhitelist(`*,${fakeParams.owNamespace}*(#@),*,****()!_+$#|{">}, ${fakeParams.owNamespace}|, $${fakeParams.owNamespace}\\-`, false))

      test('when whitelist is equal to a star', async () => testWhitelist(`*`, true))
      test('when whitelist contains the input namespace(allowed)', async () => testWhitelist(`${fakeParams.owNamespace}`, true))
      test('when whitelist contains the input namespace in a list of namespaces with symbols (allowed)', async () => testWhitelist(`,${fakeParams.owNamespace},*(#@), ()!_+$#|{">}, anotherNS2|, \\dsafksad`, true))
    })

    describe('response format', () => {
      test('when there is no error, body equals generated credentials', async () => {
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(response.body).toEqual(mockResponse)
      })
    })
  })
})
