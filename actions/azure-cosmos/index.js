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

const utils = require('tvm-utils')
const joi = require('@hapi/joi')
const cosmos = require('@azure/cosmos')

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
 * @params {number} params.expiryDuration - provided by owner, default final
 * @params {string} params.whitelist - provided by owner, default final
 * @params {string} params.owApiHost - provided by owner, default final
 *
 * @params {string} params.owAuth - user's OpenWhisk Basic Token
 * @params {string} params.owNamespace - user's OpenWhisk Namespace
 *
 * @returns {Promise<object>} {accessKeyId, secretAccessKey, sessionToken, expiration,
 * {params: Bucket} }
 */
async function main (params) {
  params.owAuth = params.__ow_headers && params.__ow_headers.authorization
  if (!(params.owAuth)) {
    return errorResponse('unauthorized request', 401)
  }
  try {
    // 0. validate params
    const resParams = utils.validateParams(params, { azureCosmosAccount: joi.string().required(), azureCosmosMasterKey: joi.string().required(), azureCosmosDatabaseName: joi.string().required() })
    if (resParams.error) {
      console.warn(`Bad request: ${resParams.error.message}`)
      return errorResponse(`${resParams.error.message}`, 400)
    }
    // important !! as joi accepts '123'
    params.expiryDuration = parseInt(params.expiryDuration)

    // we use namespace as container names, so at least 3 chars
    if (params.owNamespace.length < 3) return errorResponse('namespace must be >= 3 chars', 400)

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
    // make container name work with azure restricted char set by making it hex
    const hexName = Buffer.from(params.owNamespace, 'utf8').toString('hex')
    const endpoint = `https://${params.azureCosmosAccount}.documents.azure.com`
    const client = new cosmos.CosmosClient({ endpoint, key: params.azureCosmosMasterKey })
    const { database } = await client.databases.createIfNotExists({ id: params.azureCosmosDatabaseName })
    await client
    const containerId = 'container-' + params.azureCosmosDatabaseName
    const { container } = await database.containers.createIfNotExists({ id: containerId, partitionKey: { paths: [ '/partitionKey' ] } })

    // manual create if not exists
    let user
    const userId = 'user-' + hexName
    try {
      user = (await database.user(userId).read()).user
      await user.delete()
      user = (await database.users.create({ id: userId })).user
    } catch (e) {
      if (e.code !== 404) throw e
      user = (await database.users.create({ id: userId })).user
    }
    const permissionId = 'permission-' + hexName
    try {
      // delete to refresh permission
      await user.permission(permissionId).delete()
    } catch (e) {
      if (e.code !== 404) throw e
    }
    const resourceToken = (await user.permissions.create({ id: 'permission-' + hexName, permissionMode: cosmos.PermissionMode.All, resource: container.url, resourcePartitionKey: [hexName] }, { resourceTokenExpirySeconds: params.expiryDuration })).resource._token
    const expiryTime = new Date()
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expiryDuration)

    console.log(`Azure Cosmos resource token generated`)
    console.log(`End of request`)

    return {
      body: {
        resourceToken,
        endpoint,
        expiration: expiryTime.toISOString(),
        databaseId: params.azureCosmosDatabaseName,
        containerId,
        partitionKey: hexName
      }
    }
  } catch (e) {
    console.error(e)
    return errorResponse('server error', 500)
  }
}

exports.main = main
