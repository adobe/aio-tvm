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
const { Tvm } = require('../../../lib/Tvm')
const metrics = require('@adobe/aio-metrics-client')
jest.mock('@adobe/aio-metrics-client')

const fetch = require('node-fetch')
jest.mock('node-fetch', () => jest.fn())

const fakeResponse = jest.fn()
fakeResponse.mockResolvedValue('{}')

describe('processRequest (abstract)', () => {
  // setup
  /** @type {Tvm} */
  let tvm
  let fakeParams

  // fetch.text = jest.fn()
  // fetch.text.mockResolvedValue(fakeResponse)
  fetch.mockResolvedValue({
    text: fakeResponse,
    ok: true
  })
  beforeEach(() => {
    tvm = new Tvm()
    fakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
    metrics.incBatchCounter.mockReset()
    metrics.setMetricsURL.mockReset()
  })

  test('without implementation', async () => {
    const response = await tvm.processRequest(fakeParams)
    global.expectServerError(response, 'not implemented')
  })

  describe('with a mock implementation', () => {
    const mockResponse = {
      a: 'field',
      another: { important: { value: 1 } }
    }
    beforeEach(() => {
      tvm._generateCredentials = jest.fn()
      tvm._generateCredentials.mockResolvedValue(mockResponse)
    })

    describe('param validation', () => {
      test('when a non expected param is there', async () => global.testParam(tvm, fakeParams, 'non__expected__param', 'hello'))
      test('when a non expected param starts with `__ow*` (allowed)', async () => global.testParam(tvm, fakeParams, '__ow_param', 'hello', 200))
      test('when a non expected param has an empty key "", (allowed)', async () => global.testParam(tvm, fakeParams, '', 'hello', 200))

      test('when expirationDuration is missing', async () => global.testParam(tvm, fakeParams, 'expirationDuration', undefined))
      test('when expirationDuration is not parseInt string', async () => global.testParam(tvm, fakeParams, 'expirationDuration', 'hello'))

      test('when approvedList is missing', async () => global.testParam(tvm, fakeParams, 'approvedList', undefined))
      test('when approvedList is empty', async () => global.testParam(tvm, fakeParams, 'approvedList', ''))

      test('when owApihost is missing', async () => global.testParam(tvm, fakeParams, 'owApihost', undefined))
      test('when owApihost is not a valid uri', async () => global.testParam(tvm, fakeParams, 'owApihost', 'hello'))

      test('when owNamespace is missing', async () => global.testParam(tvm, fakeParams, 'owNamespace', undefined))
      test('when owNamespace is empty', async () => global.testParam(tvm, fakeParams, 'owNamespace', ''))
      test('when owNamespace is bigger than 63 chars', async () => global.testParam(tvm, fakeParams, 'owNamespace', 'a'.repeat(64)))
      test('when owNamespace is equal to 63 chars', async () => {
        const ns63chars = 'a'.repeat(63)
        global.owNsListMock.mockResolvedValue([ns63chars])
        await global.testParam(tvm, fakeParams, 'owNamespace', ns63chars, 200)
      })
      test('when owNamespace is smaller than 3 chars', async () => global.testParam(tvm, fakeParams, 'owNamespace', 'aa'))

      test('when authorization header is missing', async () => global.testParam(tvm, fakeParams, '__ow_headers.authorization', undefined, 403))
      test('when authorization header is empty', async () => global.testParam(tvm, fakeParams, '__ow_headers.authorization', '', 403))
      test('when authorization header is not a valid Basic auth header', async () => global.testParam(tvm, fakeParams, '__ow_headers.authorization', 'Basicfa', 403))
    })

    describe('api gw service token validation', () => {
      test('when header is missing', async () => {
        delete fakeParams.__ow_headers['x-gw-ims-authorization']
        // additional embedded test making sure false doesn't count as true
        fakeParams.disableAdobeIOApiGwTokenValidation = 'false'
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, 'Adobe I/O API Gateway service token validation failed: missing x-gw-ims-authorization header')
      })
      test('when header is not a bearer token', async () => {
        fakeParams.__ow_headers['x-gw-ims-authorization'] = 'Basic fake'
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, 'Adobe I/O API Gateway service token validation failed: x-gw-ims-authorization header is not a valid Bearer token')
      })

      test('when token is not valid', async () => {
        global.mockImsInstance.validateToken.mockResolvedValue({ valid: false, token: global.imsValidateTokenResponseNoError.token })
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, 'Adobe I/O API Gateway service token validation failed: invalid IMS token')
      })

      test('when token has a bad clientId', async () => {
        global.mockImsInstance.validateToken.mockResolvedValue({
          valid: true,
          token: {
            client_id: 'bad',
            scope: global.imsValidateTokenResponseNoError.token.scope
          }
        })
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, 'Adobe I/O API Gateway service token validation failed: token client_id \'bad\' is not allowed')
      })

      test('when token has missing scopes', async () => {
        global.mockImsInstance.validateToken.mockResolvedValue({
          valid: true,
          token: {
            client_id: global.imsValidateTokenResponseNoError.token.client_id,
            scope: 'AdobeID,other,notofinterest'
          }
        })
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, 'Adobe I/O API Gateway service token validation failed: token is missing required scopes \'openid,system\'')
      })

      test('when gw auth check is disabled and token is missing', async () => {
        delete fakeParams.__ow_headers['x-gw-ims-authorization']
        fakeParams.disableAdobeIOApiGwTokenValidation = 'true'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
      })

      test('when gw auth check is disabled and token is not valid', async () => {
        fakeParams.disableAdobeIOApiGwTokenValidation = 'true'
        global.mockImsInstance.validateToken.mockResolvedValue({ valid: false })
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
      })

      test('when gw token is valid and imsEnv is not set', async () => {
        const cacheKey = 'prod' + global.fakeGWToken
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
        // attempts to read from cache
        expect(global.mockLRUInstance.get).toHaveBeenCalledWith(cacheKey)
        expect(global.Ims).toHaveBeenCalledWith('prod')
        expect(global.mockImsInstance.validateToken).toHaveBeenCalledWith(global.fakeGWToken)
        // sets the cache
        expect(global.mockLRUInstance.set).toHaveBeenCalledWith(cacheKey, true)
      })

      test('when gw token is valid and imsEnv is stage', async () => {
        const cacheKey = 'stage' + global.fakeGWToken
        fakeParams.imsEnv = 'stage'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
        // attempts to read from cache
        expect(global.mockLRUInstance.get).toHaveBeenCalledWith(cacheKey)
        expect(global.Ims).toHaveBeenCalledWith('stage')
        expect(global.mockImsInstance.validateToken).toHaveBeenCalledWith(global.fakeGWToken)
        // sets the cache
        expect(global.mockLRUInstance.set).toHaveBeenCalledWith(cacheKey, true)
      })

      test('when gw token is valid and imsEnv is prod', async () => {
        const cacheKey = 'prod' + global.fakeGWToken
        fakeParams.imsEnv = 'prod'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
        // attempts to read from cache
        expect(global.mockLRUInstance.get).toHaveBeenCalledWith(cacheKey)
        expect(global.Ims).toHaveBeenCalledWith('prod')
        expect(global.mockImsInstance.validateToken).toHaveBeenCalledWith(global.fakeGWToken)
        // sets the cache
        expect(global.mockLRUInstance.set).toHaveBeenCalledWith(cacheKey, true)
      })

      test('when gw token is valid and is set in cache', async () => {
        const cacheKey = 'prod' + global.fakeGWToken
        global.mockLRUInstance.get.mockImplementation(k => k === cacheKey)
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toBe(200)
        expect(global.mockImsInstance.validateToken).not.toHaveBeenCalled()
        expect(global.mockLRUInstance.set).not.toHaveBeenCalled()
        expect(global.mockLRUInstance.get).toHaveBeenCalledWith(cacheKey)
      })
    })

    describe('openwhisk namespace/auth validation', () => {
      test('when openwhisk.namespaces.list throws a 400 error', async () => {
        const errorMsg = 'abfjdsjfhbv'
        const errorObj = new Error(errorMsg)
        errorObj.statusCode = 400
        global.owNsListMock.mockRejectedValue(errorObj)
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, errorMsg)
      })

      test('when openwhisk.namespaces.list throws a 401 error', async () => {
        const errorMsg = 'abfjdsjfhbv'
        const errorObj = new Error(errorMsg)
        errorObj.statusCode = 401
        global.owNsListMock.mockRejectedValue(errorObj)
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, errorMsg)
      })

      test('when openwhisk.namespaces.list throws a 403 error', async () => {
        const errorMsg = 'abfjdsjfhbv'
        const errorObj = new Error(errorMsg)
        errorObj.statusCode = 403
        global.owNsListMock.mockRejectedValue(errorObj)
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, errorMsg)
      })

      test('when openwhisk.namespaces.list throws a non 4xx', async () => {
        const errorMsg = 'abfjdsjfhbv'
        const errorObj = new Error(errorMsg)
        errorObj.statusCode = 503
        global.owNsListMock.mockRejectedValue(errorObj)
        const response = await tvm.processRequest(fakeParams)
        global.expect500Error(response, errorMsg)
      })

      test('when openwhisk.namespaces.list throws an error without code', async () => {
        const errorMsg = 'abfjdsjfhbv'
        const errorObj = new Error(errorMsg)
        global.owNsListMock.mockRejectedValue(errorObj)
        const response = await tvm.processRequest(fakeParams)
        global.expect500Error(response, errorMsg)
      })

      test('when openwhisk.namespaces.list returns with an empty list', async () => {
        global.owNsListMock.mockResolvedValue([])
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, '[]')
      })
      test('when openwhisk.namespaces.list returns with a list not containing the namespace', async () => {
        global.owNsListMock.mockResolvedValue(['notinthelist', 'anotherNS'])
        const response = await tvm.processRequest(fakeParams)
        global.expectUnauthorized(response, '[notinthelist,anotherNS]')
      })
      test('when openwhisk.namespaces.list returns with a list containing only the namespace (authorized)', async () => {
        global.owNsListMock.mockResolvedValue([fakeParams.owNamespace])
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
      })
      test('when openwhisk.namespaces.list returns with a list containing the namespace and others (authorized)', async () => {
        global.owNsListMock.mockResolvedValue([fakeParams.owNamespace, 'otherNS', 'otherNS2'])
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
      })
    })

    describe('namespace approvedList validation', () => {
      const testApprovedList = async (approvedList, expectedAuthorized) => {
        const testParams = { ...fakeParams }
        testParams.approvedList = approvedList
        const response = await tvm.processRequest(testParams)
        if (expectedAuthorized) return expect(response.statusCode).toEqual(200)
        return global.expectUnauthorized(response, 'is not approved')
      }

      test('when approvedList contains only another namespace', async () => testApprovedList('anotherNS', false))
      test('when approvedList contains a list of different namespaces', async () => testApprovedList(',anotherNS, anotherNS2,anotherNS3 ,anotherNS4 ,', false))
      test('when approvedList contains a namespace which shares the same prefix', async () => testApprovedList(`${fakeParams.owNamespace}-`, false))
      test('when approvedList contains a namespace which shares the same suffix', async () => testApprovedList(`-${fakeParams.owNamespace}`, false))
      test('when approvedList contains a namespace which shares the same prefix and escape chars', async () => testApprovedList(`\\-${fakeParams.owNamespace}`, false))
      test('when approvedList contains a namespace which shares the same suffix and escape chars', async () => testApprovedList(`${fakeParams.owNamespace}\\-`, false))
      test('when approvedList contains a list of different namespaces with symbols (including stars!) and same suffix/prefix', async () => testApprovedList(`*,${fakeParams.owNamespace}*(#@),*,****()!_+$#|{">}, ${fakeParams.owNamespace}|, $${fakeParams.owNamespace}\\-`, false))

      test('when approvedList is equal to a star', async () => testApprovedList('*', true))
      test('when approvedList contains the input namespace(allowed)', async () => testApprovedList(`${fakeParams.owNamespace}`, true))
      test('when approvedList contains the input namespace in a list of namespaces with symbols (allowed)', async () => testApprovedList(`,${fakeParams.owNamespace},*(#@), ()!_+$#|{">}, anotherNS2|, \\dsafksad`, true))
    })

    describe('response format', () => {
      test('when there is no error, body equals generated credentials', async () => {
        const requestIdStartLog = 'start of request Id - fake request id'
        const requestIdEndLog = 'end of request Id - fake request id'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(response.body).toEqual(mockResponse)
        expect(global.mockLog.info).toHaveBeenCalledWith(expect.stringContaining(requestIdStartLog))
        expect(global.mockLog.info).toHaveBeenCalledWith(expect.stringContaining(requestIdEndLog))
      })
    })
    describe('metrics enabled', () => {
      test('when metrics url is an empty string', async () => {
        fakeParams.metricsUrl = ''
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(metrics.setMetricsURL).not.toHaveBeenCalled()
      })
      test('when metrics url is not a valid uri', async () => {
        fakeParams.metricsUrl = 'aio/metrics'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(metrics.setMetricsURL).not.toHaveBeenCalled()
      })
      test('when metrics url is valid', async () => {
        fakeParams.metricsUrl = 'https://example.com/aio/metrics/'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        expect(metrics.incBatchCounter).toHaveBeenCalledWith('request_count', fakeParams.owNamespace, undefined)
      })
      test('when metrics url is valid & apigw validation failure', async () => {
        fakeParams.__ow_headers['x-gw-ims-authorization'] = 'bad format'
        fakeParams.metricsUrl = 'https://example.com/aio/metrics/'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(403)
        expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        expect(metrics.incBatchCounter).toHaveBeenCalledWith('user_error_count', fakeParams.owNamespace, '403')
      })
      test('when metrics url is valid & ow validation failure', async () => {
        fakeParams.owNamespace = 'bad namespace'
        fakeParams.metricsUrl = 'https://example.com/aio/metrics/'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(403)
        expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        expect(metrics.incBatchCounter).toHaveBeenCalledWith('user_error_count', fakeParams.owNamespace, '403')
      })
      test('when metrics url is valid & server error', async () => {
        tvm._generateCredentials.mockRejectedValue(new Error('fake error'))
        fakeParams.metricsUrl = 'https://example.com/aio/metrics/'
        const response = await tvm.processRequest(fakeParams)
        expect(response.error.statusCode).toEqual(500)
        expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        expect(metrics.incBatchCounter).toHaveBeenCalledWith('error_count', fakeParams.owNamespace, '500')
      })
    })

    describe('deny list enabled', () => {
      test('when deny list url is an empty string', async () => {
        fakeParams.denyListUrl = ''
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
      })
      test('when deny list url response not a valid', async () => {
        fakeParams.denyListUrl = 'someURL'
        fetch.mockResolvedValueOnce({
          text: fakeResponse
        })
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Error while fetching deny list'))
      })
      test('when deny list url response is empty list', async () => {
        fakeParams.denyListUrl = 'someURL'
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
        // expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        // expect(metrics.incBatchCounter).toHaveBeenCalledWith('request_count', fakeParams.owNamespace, undefined)
      })

      test('when deny list url response is valid list', async () => {
        fakeParams.denyListUrl = 'someURL'
        fakeResponse.mockResolvedValueOnce(JSON.stringify({
          statestore: {
            updated: Date.now(),
            users: {
              someNS1: 500,
              someNS2: 300
            }
          }
        }))
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
        // expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        // expect(metrics.incBatchCounter).toHaveBeenCalledWith('request_count', fakeParams.owNamespace, undefined)
      })

      test('when deny list url response is valid list with requested namespace', async () => {
        fakeParams.denyListUrl = 'someURL'
        fakeResponse.mockResolvedValueOnce(JSON.stringify({
          statestore: {
            updated: Date.now(),
            users: {
              fakeNS: 500,
              someNS: 300
            }
          }
        }))
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
        // expect(metrics.setMetricsURL).toHaveBeenCalledWith('https://example.com/aio/metrics/recordtvmmetrics')
        // expect(metrics.incBatchCounter).toHaveBeenCalledWith('request_count', fakeParams.owNamespace, undefined)
      })

      test('when deny list url fetch errors out', async () => {
        fakeParams.denyListUrl = 'someURL'
        fakeResponse.mockRejectedValueOnce(new Error('network error'))
        const response = await tvm.processRequest(fakeParams)
        expect(response.statusCode).toEqual(200)
        expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
      })
    })
  })
})
