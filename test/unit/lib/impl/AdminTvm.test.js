/*
Copyright 2022 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { AdminTvm } = require('../../../../lib/impl/AdminTvm')

const { AwsS3Tvm } = require('../../../../lib/impl/AwsS3Tvm')
jest.mock('../../../../lib/impl/AwsS3Tvm')

const { AzureBlobTvm } = require('../../../../lib/impl/AzureBlobTvm')
jest.mock('../../../../lib/impl/AzureBlobTvm')

const { AzureCosmosTvm } = require('../../../../lib/impl/AzureCosmosTvm')
jest.mock('../../../../lib/impl/AzureCosmosTvm')

// params
const fakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
fakeParams.requestedOwNamespace = 'fakeRequestedNS'
fakeParams.s3Bucket = 'fakeBucket'
fakeParams.awsAccessKeyId = 'fakeAccessKeyId'
fakeParams.awsSecretAccessKey = 'fakeSecretAccessKey'
fakeParams.azureStorageAccount = 'fakeAccount'
fakeParams.azureStorageAccessKey = 'fakeKey'
fakeParams.azureCosmosAccount = 'fakeAccount'
fakeParams.azureCosmosMasterKey = 'fakeKey'
fakeParams.azureCosmosDatabaseId = 'fakeDBId'
fakeParams.azureCosmosContainerId = 'fakeContainerId'

describe('processRequest (Admin)', () => {
  // setup
  /** @type {AdminTvm} */
  let adminTvm

  const fakeCredentials = {
    awsS3: {
      accessKeyId: 'fakeAccessKeyId',
      secretAccessKey: 'fakeSecretAccessKey',
      sessionToken: 'fakeSessionToken',
      expiration: 'fakeAwsS3Expiration',
      params: {
        Bucket: 'fakeBucket'
      }
    },
    azureBlob: {
      sasURLPrivate: 'fakeSasURLPrivate',
      sasURLPublic: 'fakeSasURLPublic',
      expiration: 'fakeSasExpiration'
    },
    azureCosmos: {
      containerId: 'fakeContainerId',
      databaseId: 'fakeDatabaseId',
      endpoint: 'fakeEndpoint',
      expiration: 'fakeExpiration',
      partitionKey: 'fakePartitionKey',
      resourceToken: 'fakeResourceToken'
    }
  }

  beforeEach(() => {
    adminTvm = new AdminTvm()
    jest.spyOn(AwsS3Tvm.prototype, '_generateCredentials').mockImplementation(async () => { return { ...fakeCredentials.awsS3 } })
    jest.spyOn(AzureBlobTvm.prototype, '_generateCredentials').mockImplementation(async () => { return { ...fakeCredentials.azureBlob } })
    jest.spyOn(AzureCosmosTvm.prototype, '_generateCredentials').mockImplementation(async () => { return { ...fakeCredentials.azureCosmos } })
  })

  describe('param validation', () => {
    test('when requestedOwNamespace is missing', async () => global.testParam(adminTvm, fakeParams, 'requestedOwNamespace', undefined))
    test('when s3Bucket is missing', async () => global.testParam(adminTvm, fakeParams, 's3Bucket', undefined))
    test('when awsAccessKeyId is missing', async () => global.testParam(adminTvm, fakeParams, 'awsAccessKeyId', undefined))
    test('when awsSecretAccessKey is missing', async () => global.testParam(adminTvm, fakeParams, 'awsSecretAccessKey', undefined))
    test('when azureStorageAccount is missing', async () => global.testParam(adminTvm, fakeParams, 'azureStorageAccount', undefined))
    test('when azureStorageAccessKey is missing', async () => global.testParam(adminTvm, fakeParams, 'azureStorageAccessKey', undefined))
    test('when azureCosmosAccount is missing', async () => global.testParam(adminTvm, fakeParams, 'azureCosmosAccount', undefined))
    test('when azureCosmosMasterKey is missing', async () => global.testParam(adminTvm, fakeParams, 'azureCosmosMasterKey', undefined))
    test('when azureCosmosDatabaseId is missing', async () => global.testParam(adminTvm, fakeParams, 'azureCosmosDatabaseId', undefined))
    test('when azureCosmosContainerId is missing', async () => global.testParam(adminTvm, fakeParams, 'azureCosmosDatabaseId', undefined))
  })

  describe('credential generation', () => {
    test('tvms return valid cloud credentials', async () => {
      const response = await adminTvm.processRequest(fakeParams)
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual(fakeCredentials)

      const mockAwsS3Tvm = AwsS3Tvm.mock.instances[0]
      const mockAwsS3GenerateCredentials = mockAwsS3Tvm._generateCredentials
      expect(mockAwsS3GenerateCredentials).toHaveBeenCalledWith(fakeParams)
      expect(mockAwsS3GenerateCredentials).toHaveBeenCalledTimes(1)

      const mockAzureBlobTvm = AzureBlobTvm.mock.instances[0]
      const mockAzureBlobGenerateCredentials = mockAzureBlobTvm._generateCredentials
      expect(mockAzureBlobGenerateCredentials).toHaveBeenCalledWith(fakeParams)
      expect(mockAzureBlobGenerateCredentials).toHaveBeenCalledTimes(1)

      const mockAzureCosmosTvm = AzureCosmosTvm.mock.instances[0]
      const mockAzureCosmosGenerateCredentials = mockAzureCosmosTvm._generateCredentials
      expect(mockAzureCosmosGenerateCredentials).toHaveBeenCalledWith(fakeParams)
      expect(mockAzureCosmosGenerateCredentials).toHaveBeenCalledTimes(1)
    })
  })
})
