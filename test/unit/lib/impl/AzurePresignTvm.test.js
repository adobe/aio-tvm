/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { AzurePresignTvm } = require('../../../../lib/impl/AzurePresignTvm')

const azure = require('@azure/storage-blob')
jest.mock('@azure/storage-blob')

// mock azure blob
azure.SharedKeyCredential = jest.fn()
azure.StorageURL.newPipeline = jest.fn()
azure.ServiceURL = jest.fn()
azure.ContainerURL.prototype.create = jest.fn()
azure.generateBlobSASQueryParameters = jest.fn()
azure.BlobSASPermissions.parse = jest.fn()
azure.Aborter.none = {}

class FakePermission {
  toString () {
    return (this.add && this.read && this.create && this.delete && this.write && this.list && 'ok') || 'not ok'
  }
}
azure.ContainerSASPermissions.mockImplementation(() => new FakePermission())

// date mock
const fakeDate = '1970-01-01T00:00:00.000Z'
const fakeCurrSeconds = 1234567890
global.Date.prototype.getSeconds = () => fakeCurrSeconds
global.Date.prototype.setSeconds = jest.fn()
global.Date.prototype.toISOString = () => fakeDate

// params
const presignReqFakeParams = JSON.parse(JSON.stringify({
  ...global.baseNoErrorParams,
  blobName: 'fakeBlob',
  expiryInSeconds: 60,
  permissions: 'rwd'
}))
presignReqFakeParams.azureStorageAccount = 'fakeAccount'
presignReqFakeParams.azureStorageAccessKey = 'fakeKey'

describe('processRequest (Azure Presign)', () => {
  // setup
  /** @type {AzurePresignTvm} */
  let tvm
  const fakeSas = 'fakeSas'
  const fakePermissionStr = 'fakeperm'
  beforeEach(() => {
    tvm = new AzurePresignTvm()
    azure.generateBlobSASQueryParameters.mockReset()
    azure.BlobSASPermissions.parse.mockReset()

    // defaults that work
    azure.generateBlobSASQueryParameters.mockReturnValue({ toString: () => fakeSas })
    azure.BlobSASPermissions.parse.mockReturnValue({ toString: () => fakePermissionStr })
  })

  describe('param validation', () => {
    test('when owNamespace is missing', async () => global.testParam(tvm, presignReqFakeParams, 'owNamespace', undefined))
    test('when azureStorageAccount is missing', async () => global.testParam(tvm, presignReqFakeParams, 'azureStorageAccount', undefined))
    test('when azureStorageAccessKey is missing', async () => global.testParam(tvm, presignReqFakeParams, 'azureStorageAccessKey', undefined))
    test('when blobName is missing', async () => global.testParam(tvm, presignReqFakeParams, 'blobName', undefined))
    test('when expiryInSeconds is missing', async () => global.testParam(tvm, presignReqFakeParams, 'expiryInSeconds', undefined))
    test('when expiryInSeconds is less than 2 sesonds', async () => global.testParam(tvm, presignReqFakeParams, 'expiryInSeconds', 1))
    test('when expiryInSeconds is greater than 86400', async () => global.testParam(tvm, presignReqFakeParams, 'expiryInSeconds', 86401))
    test('when permissions is invalid chars', async () => global.testParam(tvm, presignReqFakeParams, 'permissions', 'abc'))
    test('when permissions is wrong length', async () => global.testParam(tvm, presignReqFakeParams, 'permissions', 'rwdd'))
    test('when permissions is empty string', async () => global.testParam(tvm, presignReqFakeParams, 'permissions', ''))
  })

  describe('signature generation tests', () => {
    const testPresignSignature = async (tvm, permissions) => {
      const tempParams = JSON.parse(JSON.stringify(presignReqFakeParams))
      tempParams.permissions = permissions
      const response = await tvm.processRequest(tempParams)
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual({ signature: fakeSas })
      expect(azure.generateBlobSASQueryParameters).toHaveBeenCalledTimes(1)
      expect(azure.generateBlobSASQueryParameters).toHaveBeenCalledWith(expect.objectContaining({ permissions: fakePermissionStr }), expect.any(Object))
      expect(azure.generateBlobSASQueryParameters).toHaveBeenCalledWith(expect.objectContaining({ blobName: 'fakeBlob' }), expect.any(Object))
    }
    test('generate signature with valid params', async () => testPresignSignature(tvm, presignReqFakeParams.permissions))

    test('generate signature with default permissions', async () => testPresignSignature(tvm))

    test('generate signature with rw permissions', async () => testPresignSignature(tvm, 'rw'))

    test('generate signature with wd permissions', async () => testPresignSignature(tvm, 'wd'))

    test('generate signature with dwr permissions', async () => testPresignSignature(tvm, 'dwr'))
  })
})
