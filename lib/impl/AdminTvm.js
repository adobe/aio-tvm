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
let awsS3tvm = new AwsS3Tvm()

const { AzureBlobTvm } = require('../impl/AzureBlobTvm')
let azureBlobTvm = new AzureBlobTvm()

const { AzureCosmosTvm } = require('../impl/AzureCosmosTvm')
let azureCosmosTvm = new AzureCosmosTvm()

const aws = require('aws-sdk')
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

    let baseParams = {
        expirationDuration: params.expirationDuration,
        approvedList: params.approvedList, 
        owApihost: params.owApihost, 
        disableAdobeIOApiGwTokenValidation: params.disableAdobeIOApiGwTokenValidation,
        imsEnv: params.imsEnv,
        owNamespace: params.owNamespace,
        owAuth: params.owAuth,
        requestedOwNamespace: params.requestedOwNamespace
    }

    return objectPromise({
        s3: awsS3tvm.processAdminRequest({ ...baseParams, 
            s3Bucket: params.s3Bucket, 
            awsAccessKeyId: params.awsAccessKeyId, 
            awsSecretAccessKey: params.awsSecretAccessKey
        }),
        azureBlob: azureBlobTvm.processAdminRequest({ ...baseParams,
            azureStorageAccount: params.azureStorageAccount, 
            azureStorageAccessKey: params.azureStorageAccessKey
        }),
        azureCosmosTvm: azureCosmosTvm.processAdminRequest({ ...baseParams,
            azureCosmosAccount: params.azureCosmosAccount, 
            azureCosmosMasterKey: params.azureCosmosMasterKey, 
            azureCosmosDatabaseId: params.azureCosmosDatabaseId, 
            azureCosmosContainerId: params.azureCosmosContainerId
        })
    })
  }
}

module.exports = { AdminTvm }
