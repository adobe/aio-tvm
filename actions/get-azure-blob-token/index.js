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

const utils = require('./utils')
const joi = require('joi')

/**
 * @param  {string} err - error message
 * @param  {number} status
 * @returns {object} { body : { error: err }, statusCode: status }
 */
function errorResponse (err, status) {
  return {
    body: { error: err },
    statusCode: status
  }
}
/**
 * @param {object} params - the input params
 *
 * @params {number} params.expiryDuration - privided by owner, default final
 * @params {string} params.whitelist - privided by owner, default final
 * @params {string} params.owApiHost - privided by owner, default final
 *
 * @params {string} params.owAuth - user's OpenWhisk Basic Token
 * @params {string} params.owNamespace - user's OpenWhisk Namespace
 *
 * @returns {object} {accessKeyId, secretAccessKey, sessionToken, expiration,
 * {params: Bucket} }
 */
async function main (params) {
  try {
    // 0. validate params
    const schema = joi.object().keys({
      // default params
      // must be final params, especially the whitelist, s3Bucket and expiryDuration for security reasons
      expiryDuration: joi.number().required(),
      whitelist: joi.string().required(),
      azureStorageAccount: joi.string().required(),
      azureStorageAccessKey: joi.string().required(),
      owApihost: joi.string().uri().required(),
      // those are user openwhisk credentials passed as request params
      owAuth: joi.string().required(),
      owNamespace: joi.string().required()
    }).pattern(/^__ow_.+$/, joi.any()) // this means: allow all unknown parameters that start with __ow_
    const resParams = joi.validate(params, schema)
    if (resParams.error) {
      console.warn(`Bad request: ${resParams.error.message}`)
      return errorResponse(`${resParams.error.message}`, 400)
    }

    // we use namespace as container names, so at least 3 chars
    if (params.owNamespace.length < 3) return errorResponse('namespace must be >= 3 chars')

    console.log(`Incoming request for [ ${params.owNamespace}, ${params.owAuth.split(':')[0]} ]`)

    // 1. validate ow credentials
    const resOW = await utils.validateOWCreds(params.owApihost, params.owNamespace, params.owAuth)
    if (resOW.error) {
      console.log(`Unauthorized request: ${resOW.error.message}`)
      return errorResponse(`unauthorized request`, 401)
    }

    // 2. Make sure namespace is whitelisted
    if (!utils.isWhitelisted(params.owNamespace, params.whitelist)) {
      console.warn(`Unauthorized request: Not whitelisted`)
      return errorResponse('unauthorized request', 401)
    }

    console.log('Request is authorized')

    // 3. Build azure signed url
    const azure = require('@azure/storage-blob')
    const accountURL = `https://${params.azureStorageAccount}.blob.core.windows.net`

    // make container name work with azure restricted char set by making it hex
    const container = Buffer.from(params.owNamespace, 'utf8').toString('hex')

    const sharedKeyCredential = new azure.SharedKeyCredential(params.azureStorageAccount, params.azureStorageAccessKey)

    // todo should we create the container in the client??
    const pipeline = azure.StorageURL.newPipeline(sharedKeyCredential)
    const serviceURL = new azure.ServiceURL(accountURL, pipeline)
    const containerURL = azure.ContainerURL.fromServiceURL(serviceURL, container)
    try {
      await containerURL.create(azure.Aborter.none)
      console.log(`Created container ${container}.`)
    } catch (e) {
      if (e.body.Code !== 'ContainerAlreadyExists') throw e
      console.log(`Container ${container} already exists.`)
    }

    // generate SAS token
    const expiryTime = new Date()
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expiryDuration)

    const permissions = new azure.ContainerSASPermissions()
    permissions.add = permissions.read = permissions.create = permissions.delete = permissions.write = permissions.list = true
    const sasParams = {
      containerName: container,
      permissions: permissions.toString(),
      expiryTime: expiryTime
    }
    const sasQueryParams = azure.generateBlobSASQueryParameters(sasParams, sharedKeyCredential)

    console.log(`Azure SAS generated`)
    console.log(`End of request`)

    return {
      body: {
        private: {
          expiration: expiryTime.toISOString(),
          sasURL: `${accountURL}?${sasQueryParams.toString()}`
        },
        public: {

        }
      }
    }
  } catch (e) {
    console.error(e)
    return errorResponse('server error', 500)
  }
}

exports.main = main
