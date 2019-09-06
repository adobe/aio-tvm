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

const { AzureCosmosTVM } = require('../../../lib/impl/AzureCosmosTVM')

const cosmos = require('@azure/cosmos')
jest.mock('@azure/cosmos')

// find more standard way to mock cosmos?
const cosmosMocks = {
  container: jest.fn(),
  userRead: jest.fn(),
  usersCreate: jest.fn(),
  permissionDelete: jest.fn(),
  permissionsCreate: jest.fn()
}
const cosmosUserMock = {
  read: cosmosMocks.userRead,
  permission: () => Object({
    delete: cosmosMocks.permissionDelete
  }),
  permissions: {
    create: cosmosMocks.permissionsCreate
  }
}
cosmos.CosmosClient.mockImplementation(() => Object({
  database: () => Object({
    container: cosmosMocks.container,
    user: () => cosmosUserMock,
    users: {
      create: cosmosMocks.usersCreate
    }
  })
}))

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
  /** @type {AzureCosmosTVM} */
  let tvm
  const fakeContainerUrl = 'https://fakecontainerURL.com'
  beforeEach(() => {
    tvm = new AzureCosmosTVM()

    Object.keys(cosmosMocks).forEach(k => cosmosMocks[k].mockReset())
    // defaults that work
    cosmosMocks.container.mockReturnValue({ url: 'https://fakecontainerURL.com' })
    cosmosMocks.userRead.mockResolvedValue({ user: cosmosUserMock })
    cosmosMocks.usersCreate.mockResolvedValue({ user: cosmosUserMock })
    cosmosMocks.permissionsCreate.mockResolvedValue({ resource: { _token: fakeToken } })
  })

  describe('param validation', () => {
    test('when owNamespace is bigger than 49 chars', async () => global.testParam(tvm, fakeParams, 'owNamespace', 'a'.repeat(50)))
    test('when owNamespace is smaller than 3 chars', async () => global.testParam(tvm, fakeParams, 'owNamespace', 'aa'))
    test('when owNamespace is missing', async () => global.testParam(tvm, fakeParams, 'owNamespace', undefined))
    test('when azureCosmosAccount is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosAccount', undefined))
    test('when azureCosmosMasterKey is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosMasterKey', undefined))
    test('when azureCosmosDatabaseId is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosDatabaseId', undefined))
    test('when azureCosmosContainerId is missing', async () => global.testParam(tvm, fakeParams, 'azureCosmosDatabaseId', undefined))
  })

  describe('token generation', () => {
    const expectTokenGenerated = async () => {
      const response = await tvm.processRequest(fakeParams)

      // todo remove duplicated implementation of partitionKey name creation
      const partitionKey = Buffer.from(fakeParams.owNamespace, 'utf8').toString('hex')

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
      expect(global.Date.prototype.setSeconds).toHaveBeenCalledWith(fakeCurrSeconds + fakeParams.expirationDuration)

      // make sure permission is refreshed
      expect(cosmosMocks.permissionDelete).toHaveBeenCalledTimes(1)
      // here we are really looking into implementation details instead of just testing the interface,
      // this intentional as we want to make sure the token gives the right access level
      expect(cosmosMocks.permissionsCreate).toHaveBeenCalledWith({ id: expect.any(String), permissionMode: cosmos.PermissionMode.All, resource: fakeContainerUrl, resourcePartitionKey: [partitionKey] }, { resourceTokenExpirySeconds: fakeParams.expirationDuration })
    }

    test('when cosmosDB user & permission already exists', async () => {
      await expectTokenGenerated()
      expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(0)
    })
    test('when cosmosDB user does not exist', async () => {
      cosmosMocks.userRead.mockRejectedValue({ code: 404 })
      await expectTokenGenerated()
      expect(cosmosMocks.usersCreate).toHaveBeenCalledTimes(1)
    })
    test('when cosmosDB permission does not exist', async () => {
      cosmosMocks.permissionDelete.mockRejectedValue({ code: 404 })
      await expectTokenGenerated()
    })

    test('when cosmosDB user read reject not 404', async () => {
      cosmosMocks.userRead.mockRejectedValue(new Error('a cosmos error'))
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'a cosmos error')
    })
    test('when cosmosDB user does not exist and users.create rejects', async () => {
      cosmosMocks.userRead.mockRejectedValue({ code: 404 })
      cosmosMocks.usersCreate.mockRejectedValue(new Error('a cosmos error'))
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'a cosmos error')
    })

    test('when cosmosDB permission.delete rejects not 404', async () => {
      cosmosMocks.permissionDelete.mockRejectedValue(new Error('a cosmos error'))
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'a cosmos error')
    })
    test('when cosmosDB permissions.create rejects', async () => {
      cosmosMocks.permissionsCreate.mockRejectedValue(new Error('a cosmos error'))
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'a cosmos error')
    })
  })
})
