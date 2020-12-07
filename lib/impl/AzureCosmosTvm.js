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

const { Tvm } = require('../Tvm')
const cosmos = require('@azure/cosmos')
const logger = require('@adobe/aio-lib-core-logging')('@adobe/aio-tvm')

const RACE_RETRIES = 5
const RACE_RETRY_INTERVAL = 50 // 50 msec
const RACE_RETRY_FACTOR = 1.5

/**
 * @class AzureCosmosTvm
 * @classdesc Tvm implementation for Azure Cosmos
 * @augments {Tvm}
 */
class AzureCosmosTvm extends Tvm {
  /**
   * @memberof AzureCosmosTvm
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('azureCosmosAccount')
    this._addToValidationSchema('azureCosmosMasterKey')
    this._addToValidationSchema('azureCosmosDatabaseId')
    this._addToValidationSchema('azureCosmosContainerId')
  }

  /**
   * @memberof AzureCosmosTvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    // make container name work with azure restricted char set by making it hex
    const partitionKey = Buffer.from(params.owNamespace, 'utf8').toString('hex')

    const endpoint = `https://${params.azureCosmosAccount}.documents.azure.com`
    const client = new cosmos.CosmosClient({ endpoint, key: params.azureCosmosMasterKey })
    // db and container must already exist
    const database = client.database(params.azureCosmosDatabaseId)
    const container = database.container(params.azureCosmosContainerId)

    // set user object
    const userId = 'user-' + partitionKey
    const user = database.user(userId)

    // retrieve the permission object
    const permissionId = 'permission-' + partitionKey
    // NOTE: permissions are created once per partitionKey (= per user).
    // When we get an existing permission we can set the expiration for the returned token.
    const resourceTokenExpirySeconds = params.expirationDuration
    let permissionRes
    try {
      logger.info(`retrieving cosmosDB permission with id: ${permissionId} and expirationDuration: ${resourceTokenExpirySeconds} seconds`)
      permissionRes = await user.permission(permissionId).read({ resourceTokenExpirySeconds })
      // An alternative could be to use:
      // user.permission(permissionId).replace(permissionDefinition, { resourceTokenExpirySeconds })
    } catch (e) {
      if (e.code !== 404) {
        throw e
      }
      // if the permission doesn't exist we need to 1. create the user + 2. create the permission
      const permissionDefinition = {
        id: permissionId,
        permissionMode: cosmos.PermissionMode.All,
        resource: container.url,
        resourcePartitionKey: [partitionKey]
      }
      logger.info(`permission with id '${permissionId}' does not exist, creating a new one..`)
      permissionRes = await this.createUserAndPermission(database, userId, permissionDefinition, resourceTokenExpirySeconds)
    }

    // extract the resource token
    const resourceToken = permissionRes.resource._token

    // compute the expiration time
    const expiryTime = new Date()
    // remove 5 minutes for clock skews and permission create race conditions
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expirationDuration - 300)

    return {
      resourceToken,
      endpoint,
      expiration: expiryTime.toISOString(),
      databaseId: params.azureCosmosDatabaseId,
      containerId: params.azureCosmosContainerId,
      partitionKey
    }
  }

  async createUserAndPermission (/** @type {cosmos.Database} */ database, userId, permissionDefinition, resourceTokenExpirySeconds) {
    try {
      logger.info(`creating user '${userId}' and permission '${permissionDefinition.id}'..`)
      await database.users.create({ id: userId })
      const permissionRes = await database.user(userId).permissions.create(permissionDefinition, { resourceTokenExpirySeconds })
      return permissionRes
    } catch (e) {
      // handle race conditions, some other request in that container or another Adobe I/O Runtime
      // container might have created the resources already
      logger.info(`Received status=${e.code} on resource creation`)
      if (e.code !== 409 && e.code !== 429 && e.code !== 449) {
        throw e
      }

      logger.info('detected conflict, entering race condition resolution')

      // retry 5 times with 50 msec delay
      let retryTime = RACE_RETRY_INTERVAL
      for (let retryCount = 1; retryCount <= RACE_RETRIES; ++retryCount) {
        try {
          // attempt to retrieve the already created permission
          logger.info(`get permission '${permissionDefinition.id}'`)
          const permissionRes = await database.user(userId)
            .permission(permissionDefinition.id)
            .read({ resourceTokenExpirySeconds })
          // exit the retry loop and return the permission resource
          logger.info('successfully resolved race condition')
          return permissionRes
        } catch (e) {
          if (retryCount === RACE_RETRIES) {
            // last try
            throw e
          }
          // wait a bit before the next try
          logger.info(`retries left ${RACE_RETRIES - retryCount}, waiting ${retryTime} ms..`)
          await new Promise((resolve) => setTimeout(resolve, retryTime))
          retryTime = retryTime * RACE_RETRY_FACTOR
        }
      }
    }
  }
}

module.exports = { AzureCosmosTvm }
