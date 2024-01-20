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

const joi = require('joi')
const { Tvm } = require('../Tvm')
const azureUtil = require('./AzureUtil')
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

    // limit expiry between 2 seconds and 24 hours
    this._addToValidationSchema('expiryInSeconds', joi.number().integer().min(2).max(24 * 60 * 60).required())
    // eslint-disable-next-line prefer-regex-literals
    const limitLength = new RegExp('^.{1,3}$') // limit length from 1-3
    // eslint-disable-next-line prefer-regex-literals
    const limitChars = new RegExp('^[rwd]*$') // only allow combination of 'r', 'w' or 'd'
    this._addToValidationSchema('permissions', joi.string().regex(limitLength).regex(limitChars).optional())
  }

  /**
   * @memberof AzurePresignTvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    const accountURL = `https://${params.azureStorageAccount}.blob.core.windows.net`
    const sharedKeyCredential = new azure.SharedKeyCredential(params.azureStorageAccount, params.azureStorageAccessKey)
    const containerName = Tvm._hash(params.owNamespace)

    const privateContainerURL = azureUtil.getContainerURL(accountURL, sharedKeyCredential, containerName)
    const identifier = await azureUtil.getAccessPolicy(privateContainerURL, params.azureStorageAccount, params.azureStorageAccessKey)

    if (identifier === undefined) { throw new Error(`No Access Policy set for container ${containerName}`) }

    // generate SAS token
    const expiryTime = new Date(Date.now() + (1000 * params.expiryInSeconds))
    const perm = (params.permissions === undefined) ? 'r' : params.permissions
    const permissions = azure.BlobSASPermissions.parse(perm)

    const commonSasParams = {
      permissions: permissions.toString(),
      expiryTime,
      blobName: params.blobName,
      identifier,
      version: '2019-12-12'
    }

    const sasQueryParamsPrivate = azure.generateBlobSASQueryParameters({ ...commonSasParams, containerName }, sharedKeyCredential)
    return {
      signature: sasQueryParamsPrivate.toString()
    }
  }
}

module.exports = { AzurePresignTvm }
