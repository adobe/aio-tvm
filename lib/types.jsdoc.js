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

// TODO do not repeat response types with tvm client lib..

/* istanbul ignore file */

/** @module types */

/* **************************** PARAMETERS ***************************** */
/**
 * @typedef TvmParamsAzureBlob
 * @type {object}
 * @property {string} params.azureStorageAccessKey - specific to blob, provided by owner, default final
 * @property {string} params.azureStorageAccount - specific to blob, provided by owner, default final
 *
 * @property {number} params.expirationDuration - provided by owner, default final
 * @property {string} params.whitelist - provided by owner, default final
 * @property {string} params.owApiHost - provided by owner, default final
 *
 * @property {string} params.owAuth - user's OpenWhisk Basic Token
 * @property {string} params.owNamespace - user's OpenWhisk Namespace
 *
 */

/**
 * @typedef TvmParamsAzureCosmos
 * @type {object}
 * @property {string} params.azureCosmosMasterKey - specific to cosmos, provided by owner, default final
 * @property {string} params.azureCosmosAccount - specific to cosmos, provided by owner, default final
 * @property {string} params.azureCosmosDatabaseId - specific to cosmos, provided by owner, default final
 * @property {string} params.azureCosmosContainerId - specific to cosmos, provided by owner, default final
 *
 * @property {number} params.expirationDuration - provided by owner, default final
 * @property {string} params.whitelist - provided by owner, default final
 * @property {string} params.owApiHost - provided by owner, default final
 *
 * @property {string} params.owAuth - user's OpenWhisk Basic Token
 * @property {string} params.owNamespace - user's OpenWhisk Namespace
 *
 */

/**
 * @typedef TvmParamsAwsS3
 * @type {object}
 * @property {string} params.awsSecretAccessKey - specific to s3, provided by owner, default final
 * @property {string} params.awsAccessKeyId - specific to s3, provided by owner, default final
 * @property {string} params.s3Bucket - specific to s3, provided by owner, default final
 *
 * @property {number} params.expirationDuration - provided by owner, default final
 * @property {string} params.whitelist - provided by owner, default final
 * @property {string} params.owApiHost - provided by owner, default final
 *
 * @property {string} params.owAuth - user's OpenWhisk Basic Token
 * @property {string} params.owNamespace - user's OpenWhisk Namespace
 *
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
 *
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
 *
 */

/**
 * @typedef TvmResponseAwsS3
 * @type {object}
 * @property {string} accessKeyId key id
 * @property {string} secretAccessKey secret for key
 * @property {string} sessionToken token
 * @property {string} expiration date ISO/UTC
 * @property {object} params
 * @property {string} params.Bucket bucket name
 *
 */
