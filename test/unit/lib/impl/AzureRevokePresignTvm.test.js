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

/* eslint jest/expect-expect: ["error", { "assertFunctionNames": [
    "expect",
    "global.testParam",
    "global.expectServerError",
    "global.expectUnauthorized",
    "global.expect500Error",
    "testRevokeSignature"
] }] */

const { AzureRevokePresignTvm } = require('../../../../lib/impl/AzureRevokePresignTvm')
const azureUtil = require('../../../../lib/impl/AzureUtil')
jest.mock('../../../../lib/impl/AzureUtil')
azureUtil.getContainerURL.mockReturnValue({ fake: '' })

const azure = require('@azure/storage-blob')
jest.mock('@azure/storage-blob')
jest.mock('@adobe/aio-metrics-client')

// mock azure blob
azure.SharedKeyCredential = jest.fn()
azure.StorageURL.newPipeline = jest.fn()
azure.ServiceURL = jest.fn()
azure.Aborter.none = {}

// params
const presignReqFakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
presignReqFakeParams.azureStorageAccount = 'fakeAccount'
presignReqFakeParams.azureStorageAccessKey = 'fakeKey'

describe('processRequest (Azure Revoke Presign)', () => {
  // setup
  /** @type {AzureRevokePresignTvm} */
  let tvm
  beforeEach(() => {
    tvm = new AzureRevokePresignTvm()
  })

  describe('signature revoke tests', () => {
    const testRevokeSignature = async (tvm) => {
      const tempParams = JSON.parse(JSON.stringify(presignReqFakeParams))
      const response = await tvm.processRequest(tempParams)
      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual({})
      expect(azureUtil.setAccessPolicy).toHaveBeenCalledTimes(1)
      expect(azureUtil.setAccessPolicy).toHaveBeenCalledWith({ fake: '' }, 'fakeAccount')
    }

    test('revoke signature', async () => testRevokeSignature(tvm))
  })
})
