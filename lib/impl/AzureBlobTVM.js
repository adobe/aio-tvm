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

const { TVM } = require('../TVM')
const azure = require('@azure/storage-blob')
const joi = require('@hapi/joi')

// eslint-disable-next-line jsdoc/require-jsdoc
async function _createContainerIfNotExists (container, aborter, options) {
  try {
    await container.create(aborter, options)
  } catch (e) {
    if (e.body === undefined || (e.body.Code !== 'ContainerAlreadyExists' && e.body.code !== 'ContainerAlreadyExists')) throw e
  }
}

/**
 * @class AzureBlobTVM
 * @classdesc TVM implementation for Azure Blob
 * @augments {TVM}
 */
class AzureBlobTVM extends TVM {
  /**
   * @memberof AzureBlobTVM
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('azureStorageAccount')
    this._addToValidationSchema('azureStorageAccessKey')
    // min chars for container name, make sure owNamespace has at least 3 chars
    this._addToValidationSchema('owNamespace', joi.string().min(3).required())
  }

  /**
   * @memberof AzureBlobTVM
   * @override
   * @private
   */
  async _generateCredentials (params) {
    const accountURL = `https://${params.azureStorageAccount}.blob.core.windows.net`
    const sharedKeyCredential = new azure.SharedKeyCredential(params.azureStorageAccount, params.azureStorageAccessKey)

    // make container name work with azure restricted char set by making it hex
    const containerName = Buffer.from(params.owNamespace, 'utf8').toString('hex')
    const privateContainerName = containerName
    const publicContainerName = containerName + '-public'

    // create containers - we need to do it here as the sas creds do not allow it
    const pipeline = azure.StorageURL.newPipeline(sharedKeyCredential)
    const serviceURL = new azure.ServiceURL(accountURL, pipeline)
    await _createContainerIfNotExists(azure.ContainerURL.fromServiceURL(serviceURL, publicContainerName), azure.Aborter.none, { access: 'blob', metadata: { namespace: params.owNamespace } })
    await _createContainerIfNotExists(azure.ContainerURL.fromServiceURL(serviceURL, privateContainerName), azure.Aborter.none, { metadata: { namespace: params.owNamespace } })

    // generate SAS token
    const expiryTime = new Date()
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expirationDuration)

    const permissions = new azure.ContainerSASPermissions()
    permissions.add = permissions.read = permissions.create = permissions.delete = permissions.write = permissions.list = true
    const commonSasParams = {
      permissions: permissions.toString(),
      expiryTime: expiryTime
    }

    const sasQueryParamsPrivate = azure.generateBlobSASQueryParameters({ ...commonSasParams, containerName: privateContainerName }, sharedKeyCredential)
    const sasQueryParamsPublic = azure.generateBlobSASQueryParameters({ ...commonSasParams, containerName: publicContainerName }, sharedKeyCredential)

    return {
      expiration: expiryTime.toISOString(),
      sasURLPrivate: `${accountURL}/${privateContainerName}?${sasQueryParamsPrivate.toString()}`,
      sasURLPublic: `${accountURL}/${publicContainerName}?${sasQueryParamsPublic.toString()}`
    }
  }
}

module.exports = { AzureBlobTVM }
