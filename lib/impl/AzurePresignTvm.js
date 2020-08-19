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

const joi = require('@hapi/joi')
const { Tvm } = require('../Tvm')
const azure = require('@azure/storage-blob')

/**
 * @class AzurePresignTvm
 * @classdesc Tvm implementation for Azure Blob
 * @augments {Tvm}
 */
class AzurePresignTvm extends Tvm {
  /**
   * @memberof AzurePresignTvm
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('azureStorageAccount')
    this._addToValidationSchema('azureStorageAccessKey')
    this._addToValidationSchema('blobName')
    this._addToValidationSchema('expiryInSeconds', joi.number().integer().min(30).max(18000).required())
    this._addToValidationSchema('permissions')
  }

  /**
   * @memberof AzurePresignTvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    const sharedKeyCredential = new azure.SharedKeyCredential(params.azureStorageAccount, params.azureStorageAccessKey)
    const containerName = Tvm._hash(params.owNamespace)

    // generate SAS token
    const expiryTime = new Date()
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expiryInSeconds)

    const permissions = azure.BlobSASPermissions.parse(params.permissions)
    const commonSasParams = {
      permissions: permissions.toString(),
      expiryTime: expiryTime,
      blobName: params.blobName
    }

    const sasQueryParamsPrivate = azure.generateBlobSASQueryParameters({ ...commonSasParams, containerName: containerName }, sharedKeyCredential)
    return {
      signature: sasQueryParamsPrivate.toString()
    }
  }
}

module.exports = { AzurePresignTvm }
