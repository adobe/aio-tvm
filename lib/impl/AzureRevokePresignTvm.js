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

const { Tvm } = require('../Tvm')
const azureUtil = require('./AzureUtil')
const azure = require('@azure/storage-blob')

/**
 * @class AzureRevokePresignTvm
 * @classdesc Tvm implementation for Azure Revoke Presign URLs
 * @augments {Tvm}
 */
class AzureRevokePresignTvm extends Tvm {
  /**
   * @memberof AzureRevokePresignTvm
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('azureStorageAccount')
    this._addToValidationSchema('azureStorageAccessKey')
  }

  /**
   * @memberof AzureRevokePresignTvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    const containerName = Tvm._hash(params.owNamespace)
    const containerNamePublic = Tvm._hash(params.owNamespace) + '-public'

    const accountURL = `https://${params.azureStorageAccount}.blob.core.windows.net`

    const sharedKeyCredential = new azure.SharedKeyCredential(params.azureStorageAccount, params.azureStorageAccessKey)
    const containerURL = azureUtil.getContainerURL(accountURL, sharedKeyCredential, containerName)
    const containerURLPublic = azureUtil.getContainerURL(accountURL, sharedKeyCredential, containerNamePublic)

    // revoke presign urls by resetting the default access policy
    await azureUtil.setAccessPolicy(containerURL, params.azureStorageAccount)
    await azureUtil.setAccessPolicy(containerURLPublic, params.azureStorageAccount)
  }
}

module.exports = { AzureRevokePresignTvm }
