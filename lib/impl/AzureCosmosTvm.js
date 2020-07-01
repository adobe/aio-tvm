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

    // create if not exists
    let user
    const userId = 'user-' + partitionKey
    try {
      user = (await database.user(userId).read()).user
    } catch (e) {
      if (e.code !== 404) throw e
      user = (await database.users.create({ id: userId })).user
    }

    const permissionId = 'permission-' + partitionKey
    try {
      // delete to refresh permission (b/c of expiration)
      await user.permission(permissionId).delete()
    } catch (e) {
      if (e.code !== 404) throw e
    }
    const resourceToken = (await user.permissions.create({ id: permissionId, permissionMode: cosmos.PermissionMode.All, resource: container.url, resourcePartitionKey: [partitionKey] }, { resourceTokenExpirySeconds: params.expirationDuration })).resource._token

    const expiryTime = new Date()
    expiryTime.setSeconds(expiryTime.getSeconds() + params.expirationDuration)

    return {
      resourceToken,
      endpoint,
      expiration: expiryTime.toISOString(),
      databaseId: params.azureCosmosDatabaseId,
      containerId: params.azureCosmosContainerId,
      partitionKey
    }
  }
}

module.exports = { AzureCosmosTvm }
