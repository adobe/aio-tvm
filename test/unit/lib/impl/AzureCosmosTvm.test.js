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

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": [
    "expect",
    "global.testParam",
    "global.expectServerError",
    "global.expectUnauthorized",
    "global.expect500Error",
    "expectTokenGenerated"
] }] */

const { AzureCosmosTvm } = require('../../../../lib/impl/AzureCosmosTvm')

const cosmos = require('@azure/cosmos')
jest.mock('@azure/cosmos')
// because metrics-client uses setTimeout, and some of these tests mock setTimeout
jest.mock('@adobe/aio-metrics-client')

const fetch = require('node-fetch')
const { Tvm } = require('../../../../lib/Tvm')
jest.mock('node-fetch', () => jest.fn())

const fakeResponse = jest.fn()
const fetchDenyListSpy = jest.spyOn(Tvm.prototype, '_fetchDenyList')
const processDenyListSpy = jest.spyOn(Tvm.prototype, '_processDenyList')

// find more standard way to mock cosmos?
const cosmosMocks = {
  container: jest.fn(),
  usersCreate: jest.fn(),
  permissionsCreate: jest.fn(),
  permissionRead: jest.fn()
}
const permissionInstanceMock = jest.fn(() => Object({
  delete: cosmosMocks.permissionDelete,
  read: cosmosMocks.permissionRead
}))
const userInstanceMock = jest.fn(() => cosmosUserMock)
const cosmosUserMock = {
  read: cosmosMocks.userRead,
  permission: permissionInstanceMock,
  permissions: {
    create: cosmosMocks.permissionsCreate
  }
}
cosmos.CosmosClient.mockImplementation(() => Object({
  database: () => Object({
    container: cosmosMocks.container,
    user: userInstanceMock,
    users: {
      create: cosmosMocks.usersCreate
    }
  })
}))

// setTimeout mock
const actualSetTimeout = setTimeout
global.setTimeout = jest.fn().mockImplementation((fn) => fn())
afterAll(() => { global.setTimeout = actualSetTimeout })

// date mock
const fakeDate = '1970-01-01T00:00:00.000Z'
const fakeCurrSeconds = 1234567890
global.Date.prototype.getSeconds = () => fakeCurrSeconds
global.Date.prototype.setSeconds = jest.fn()
global.Date.prototype.toISOString = () => fakeDate

// fake generated resource token
const fakeToken = 'fakeToken'

// params
const fakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
fakeParams.azureCosmosAccount = 'fakeAccount'
fakeParams.azureCosmosMasterKey = 'fakeKey'
fakeParams.azureCosmosDatabaseId = 'fakeDBId'
fakeParams.azureCosmosContainerId = 'fakeContainerId'

describe('processRequest (Azure Cosmos)', () => {
  // setup
  /** @type {AzureCosmosTvm} */
  let tvm
  const fakeContainerUrl = 'https://fakecontainerURL.com'
  beforeEach(() => {
    tvm = new AzureCosmosTvm()

    Object.keys(cosmosMocks).forEach(k => cosmosMocks[k].mockReset())
    // defaults that work
    cosmosMocks.container.mockReturnValue({ url: fakeContainerUrl })
    cosmosMocks.usersCreate.mockResolvedValue({ user: cosmosUserMock })
    cosmosMocks.permissionsCreate.mockResolvedValue({ resource: { _token: fakeToken } })
    cosmosMocks.permissionRead.mockResolvedValue({ resource: { _token: fakeToken } })
    permissionInstanceMock.mockClear()
    userInstanceMock.mockClear()

    global.setTimeout.mockClear()

    fetch.mockResolvedValue({
      text: fakeResponse,
      ok: true
    })
    fakeResponse.mockResolvedValue('{}')
    fetchDenyListSpy.mockClear()
    processDenyListSpy.mockClear()
    Tvm.inMemoryCache = {}
    global.mockLog.warn.mockClear()
  })

  describe('param validation', () => {
    test('when azureCosmosAccount is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosAccount', undefined))
    test('when azureCosmosMasterKey is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosMasterKey', undefined))
    test('when azureCosmosDatabaseId is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosDatabaseId', undefined))
    test('when azureCosmosContainerId is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosDatabaseId', undefined))
  })

  const partitionKey = Buffer.from(fakeParams.owNamespace, 'utf8').toString('hex')

  describe('token generation', () => {
    const expectTokenGenerated = (response) => {
      // check response
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual({
        databaseId: fakeParams.azureCosmosDatabaseId,
        containerId: fakeParams.azureCosmosContainerId,
        expiration: fakeDate,
        partitionKey,
        resourceToken: fakeToken,
        endpoint: `https://${fakeParams.azureCosmosAccount}.documents.azure.com`
      })

      // make sure we compute expiration correctly
      expect(global.Date.prototype.setSeconds).toHaveBeenCalledWith(fakeCurrSeconds + fakeParams.expirationDuration - 300)

      expect(userInstanceMock).toHaveBeenCalledWith('user-' + partitionKey)
      expect(permissionInstanceMock).toHaveBeenCalledWith('permission-' + partitionKey)
    }

    const testRaceCondition = async ({ retries, code, failsOnUserCreate, failsOnPermissionCreate }) => {
      const maxRetries = 5
      const retryInterval = 50
      const retryFactor = 1.5
      if (!failsOnPermissionCreate && !failsOnUserCreate) {
        throw new Error('invalid test')
      }

      let counter = 0
      cosmosMocks.permissionRead.mockImplementation(() => {
        counter += 1
        if (counter === 1 + retries) {
          return { resource: { _token: fakeToken } }
        }
        const err = new Error('permission read error')
        err.code = 404
        throw err
      })
      if (failsOnUserCreate) {
        cosmosMocks.usersCreate.mockRejectedValue({ code })
      }
      if (failsOnPermissionCreate && !failsOnUserCreate) {
        cosmosMocks.permissionsCreate.mockRejectedValue({ code })
      }

      const response = await tvm.processRequest(fakeParams)

      expect(setTimeout).toHaveBeenCalledTimes(Math.min(retries - 1, maxRetries - 1))
      for (let i = 0; i < Math.min(retries - 1, maxRetries - 1); ++i) {
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), Math.pow(retryFactor, i) * retryInterval)
      }

      if (failsOnUserCreate) {
        expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(1)
        expect(cosmosMocks.permissionsCreate).toHaveBeenCalledTimes(0)
      }
      if (failsOnPermissionCreate && !failsOnUserCreate) {
        expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(1)
        expect(cosmosMocks.permissionsCreate).toHaveBeenCalledTimes(1)
      }
      return response
    }

    test('when cosmosDB user & permission already exists', async () => {
      const response = await tvm.processRequest(fakeParams)
      expectTokenGenerated(response)
      expect(cosmosMocks.permissionRead).toHaveBeenCalledWith({
        resourceTokenExpirySeconds: fakeParams.expirationDuration
      })
      expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(0)
      expect(cosmosMocks.permissionsCreate).toHaveBeenCalledTimes(0)
    })

    test('when cosmosDB permission does not exist', async () => {
      cosmosMocks.permissionRead.mockRejectedValue({ code: 404 })
      const response = await tvm.processRequest(fakeParams)
      expectTokenGenerated(response)
      expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(1)
      expect(cosmosMocks.permissionsCreate).toHaveBeenCalledTimes(1)
    })

    test('when cosmosDB permission does not exist and there is a race condition on user creation (409)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnUserCreate: true, code: 409 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition on user creation (429)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnUserCreate: true, code: 429 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition on user creation (449)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnUserCreate: true, code: 449 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition on permission creation (409)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnPermissionCreate: true, code: 409 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition on permission creation (429)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnPermissionCreate: true, code: 429 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition on permission creation (449)', async () => {
      const response = await testRaceCondition({ retries: 4, failsOnPermissionCreate: true, code: 449 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition with no additional retries', async () => {
      const response = await testRaceCondition({ retries: 1, failsOnPermissionCreate: true, code: 409 })
      expectTokenGenerated(response)
    })

    test('when cosmosDB permission does not exist and there is a race condition that does not resolve after maxRetries', async () => {
      const response = await testRaceCondition({ retries: 6, failsOnPermissionCreate: true, code: 409 })
      global.expectServerError(response, 'permission read error')
    })

    test('when permission read throws and is not a 404', async () => {
      const err = new Error('permission read error')
      err.code = 409
      cosmosMocks.permissionRead.mockRejectedValue(err)
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'permission read error')
    })

    test('when there permission must be created and create user throws with !(409|429|449)', async () => {
      const err = new Error('user create error')
      err.code = 444
      cosmosMocks.permissionRead.mockRejectedValue({ code: 404 })
      cosmosMocks.usersCreate.mockRejectedValue(err)
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'user create error')
    })

    test('when there permission must be created and create permission throws with !(409|429|449)', async () => {
      const err = new Error('permission create error')
      err.code = 444
      cosmosMocks.permissionRead.mockRejectedValue({ code: 404 })
      cosmosMocks.permissionsCreate.mockRejectedValue(err)
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'permission create error')
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
      expect(response.statusCode).toEqual(429)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(1)
      expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('throttled request: Usage - 500RUs is above threshold. Wait for sometime and retry.'))
    })

    test('when deny list url response is valid list without requested namespace', async () => {
      fakeParams.denyListUrl = 'someURL'
      fakeResponse.mockResolvedValueOnce(JSON.stringify({
        statestore: {
          updated: Date.now(),
          users: {
            someNS1: 200,
            someNS2: 200
          }
        }
      }))
      const response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
    })

    test('when deny list url response is valid but list is expired', async () => {
      const expiredDate = new Date(Date.now() - fakeParams.expirationDuration * 1000).valueOf()
      fakeParams.denyListUrl = 'someURL'
      fakeResponse.mockResolvedValueOnce(JSON.stringify({
        statestore: {
          updated: expiredDate,
          users: {
            fakeNS: 400,
            someNS: 600
          }
        }
      }))
      const response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Deny list is expired - ' + expiredDate))
    })

    test('when deny list url response is empty list', async () => {
      fakeParams.denyListUrl = 'someURL'
      fakeResponse.mockReset()
      fakeResponse.mockResolvedValueOnce('{}')
      const response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
    })

    test('when deny list url fetch errors out', async () => {
      fakeParams.denyListUrl = 'someURL'
      fakeResponse.mockReset()
      fakeResponse.mockRejectedValueOnce(new Error('network error'))
      const response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Error while fetching deny list'))
      expect(processDenyListSpy).toHaveBeenCalledTimes(0)
    })

    test('when deny list is fetched from inMemoryCache', async () => {
      fakeParams.denyListUrl = 'someURL'
      fakeResponse.mockResolvedValueOnce(JSON.stringify({
        statestore: {
          updated: Date.now(),
          users: {
            someNS1: 200,
            someNS2: 200
          }
        }
      }))

      // This call will fetch a new list and add to inMemoryCache
      let response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
      expect(fetchDenyListSpy).toHaveBeenCalledTimes(1)
      expect(Tvm.inMemoryCache.expiry).toBeDefined()
      expect(Tvm.inMemoryCache.expiry).toBeGreaterThan(Date.now())

      // This next call to tvm should use the inMemoryCache and not fetch Deny List from URL
      fetchDenyListSpy.mockClear()
      response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
      expect(fetchDenyListSpy).toHaveBeenCalledTimes(0)

      // Here we mock an expired inMemoryCache
      fetchDenyListSpy.mockClear()
      Tvm.inMemoryCache.expiry = Date.now() // cache expired
      response = await tvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(global.mockLog.warn).toHaveBeenCalledTimes(0)
      expect(fetchDenyListSpy).toHaveBeenCalledTimes(1)
    })
  })
})
