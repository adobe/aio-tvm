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

const { AwsS3Tvm } = require('../impl/AwsS3Tvm')
const awsS3tvm = new AwsS3Tvm()

const { AzureBlobTvm } = require('../impl/AzureBlobTvm')
const azureBlobTvm = new AzureBlobTvm()

const { AzureCosmosTvm } = require('../impl/AzureCosmosTvm')
const azureCosmosTvm = new AzureCosmosTvm()

const { objectPromise } = require('../../actions/utils')

/**
 * @class AdminTvm
 * @classdesc Tvm implementation for Admin
 * @augments {Tvm}
 */
class AdminTvm extends Tvm {
  /**
   * @memberof AdminTvm
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('requestedOwNamespace')
    this._addToValidationSchema('s3Bucket')
    this._addToValidationSchema('awsAccessKeyId')
    this._addToValidationSchema('awsSecretAccessKey')
    this._addToValidationSchema('azureStorageAccount')
    this._addToValidationSchema('azureStorageAccessKey')
    this._addToValidationSchema('azureCosmosAccount')
    this._addToValidationSchema('azureCosmosMasterKey')
    this._addToValidationSchema('azureCosmosDatabaseId')
    this._addToValidationSchema('azureCosmosContainerId')
  }

  /**
   * @memberof AdminTvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    return objectPromise({
      s3: awsS3tvm._generateCredentials(params),
      azureBlob: azureBlobTvm._generateCredentials(params),
      azureCosmosTvm: azureCosmosTvm._generateCredentials(params)
    })
  }
}

module.exports = { AdminTvm }
