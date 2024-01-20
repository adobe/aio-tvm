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

// could we leverage this to generate the swagger doc? and the aio-lib-core-tvm types?

/* istanbul ignore file */

/** @module types */

/* **************************** PARAMETERS ***************************** */
/**
 * @typedef TvmParamsAzureBlob
 * @type {object}
 * @property {string} azureStorageAccessKey - specific to blob, provided by owner, default final
 * @property {string} azureStorageAccount - specific to blob, provided by owner, default final
 * @property {number} expirationDuration - provided by owner, default final
 * @property {string} approvedList - provided by owner, default final
 * @property {string} owApiHost - provided by owner, default final
 * @property {string} owAuth - user's OpenWhisk Basic Token
 * @property {string} owNamespace - user's OpenWhisk Namespace, must be between 3 and 63 chars long
 */

/**
 * @typedef TvmParamsAzureCosmos
 * @type {object}
 * @property {string} azureCosmosMasterKey - specific to cosmos, provided by owner, default final
 * @property {string} azureCosmosAccount - specific to cosmos, provided by owner, default final
 * @property {string} azureCosmosDatabaseId - specific to cosmos, provided by owner, default final
 * @property {string} azureCosmosContainerId - specific to cosmos, provided by owner, default final
 * @property {number} expirationDuration - provided by owner, default final
 * @property {string} approvedList - provided by owner, default final
 * @property {string} owApiHost - provided by owner, default final
 * @property {string} owAuth - user's OpenWhisk Basic Token
 * @property {string} owNamespace - user's OpenWhisk Namespace, must be between 3 and 63 chars long
 */

/**
 * @typedef TvmParamsAwsS3
 * @type {object}
 * @property {string} awsSecretAccessKey - specific to s3, provided by owner, default final
 * @property {string} awsAccessKeyId - specific to s3, provided by owner, default final
 * @property {string} s3Bucket - specific to s3, provided by owner, default final
 * @property {number} expirationDuration - provided by owner, default final
 * @property {string} approvedList - provided by owner, default final
 * @property {string} owApiHost - provided by owner, default final
 * @property {string} owAuth - user's OpenWhisk Basic Token
 * @property {string} owNamespace - user's OpenWhisk Namespace, must be between 3 and 63 chars long
 */

/* **************************** RESPONSE ***************************** */
/**
 * @typedef TvmResponseAzureBlob
 * @type {object}
 * @property {string} sasURLPrivate sas url to existing private azure blob
 * container
 * @property {string} sasURLPublic sas url to existing public (with
 * access=`blob`) azure blob container
 * @property {string} expiration expiration date ISO/UTC
 */

/**
 * @typedef TvmResponseAzureCosmos
 * @type {object}
 * @property {string} endpoint cosmosdb resource endpoint
 * @property {string} resourceToken cosmosdb resource token restricted to access the items in the partitionKey
 * @property {string} databaseId id for cosmosdb database
 * @property {string} containerId id for cosmosdb container within database
 * @property {string} partitionKey key for cosmosdb partition within container authorized by resource token
 * @property {string} expiration expiration date ISO/UTC
 */

/**
 * @typedef TvmResponseAwsS3
 * @type {object}
 * @property {string} accessKeyId key id
 * @property {string} secretAccessKey secret for key
 * @property {string} sessionToken token
 * @property {string} expiration date ISO/UTC
 * @property {object} params the response params
 * @property {string} params.Bucket bucket name
 */
