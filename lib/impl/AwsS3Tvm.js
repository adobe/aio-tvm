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
const aws = require('aws-sdk')

const POLICY_TEMPLATE = {
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'AllowS3FolderListing',
      Action: ['s3:ListBucket'],
      Effect: 'Allow',
      Resource: ['arn:aws:s3:::__RESOURCE_NAME__'],
      Condition: { StringLike: { 's3:prefix': ['__USER_NAMESPACE__/*'] } }
    },
    {
      Sid: 'AllowS3FolderOperations',
      Effect: 'Allow',
      Action: ['s3:PutObject', 's3:DeleteObject', 's3:PutObjectAcl', 's3:GetObject'],
      Resource: ['arn:aws:s3:::__RESOURCE_NAME__/__USER_NAMESPACE__/*']
    }
  ]
}

const wrapAWSCall = async promise => {
  // When calling aws, for some errors (e.g undefined accessKeyId) the action
  // seems to hang when running in OpenWhisk. A temporary hack is to enforce a
  // timeout. An error response is correctly returned from AWS when running the
  // action locally. Todo: investigate why this sometimes hangs in prod
  const stsTimeout = 20000
  let timeoutId
  let res
  try {
    res = await Promise.race([
      promise,
      /* istanbul ignore next */
      new Promise((resolve, reject) => {
        /* istanbul ignore next */
        timeoutId = setTimeout(() => reject(new Error(`aws call timed out after ${stsTimeout}, are credentials set?`)), stsTimeout)
      })
    ])
  } finally {
    clearTimeout(timeoutId)
  }
  return res
}

/**
 * Replaces __RESOURCE_NAME__ and __USER_NAMESPACE__ placeholders
 * Replaces __RESOURCE_NAME__
 * with parameters in policy
 *
 * @param  {string} resourceName aws resource name
 * @param  {string} namespace ow namespace
 * @returns {string} stringified policy object
 */
function generatePolicy (resourceName, namespace) {
  return JSON.stringify(POLICY_TEMPLATE)
  .replace(/__RESOURCE_NAME__/g, resourceName)
  .replace(/__USER_NAMESPACE__/g, namespace)
}

/**
 * @class AwsS3Tvm
 * @classdesc Tvm implementation for Aws S3
 * @augments {Tvm}
 */
class AwsS3Tvm extends Tvm {
  /**
   * @memberof AwsS3Tvm
   * @override
   */
  constructor () {
    super()
    this._addToValidationSchema('s3Bucket')
    this._addToValidationSchema('awsAccessKeyId')
    this._addToValidationSchema('awsSecretAccessKey')
  }

  /**
   * @memberof AwsS3Tvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    // 0. set aws credentials
    aws.config.update({
      accessKeyId: params.awsAccessKeyId,
      secretAccessKey: params.awsSecretAccessKey
    })

    // 1. generate policy from template
    const policy = generatePolicy(params.s3Bucket, params.owNamespace)
    console.log(policy)
    // 2. generate credentials
    const sts = new aws.STS({ apiVersion: '2011-06-15' })
    const stsRes = await wrapAWSCall(sts.getFederationToken({
      DurationSeconds: params.expirationDuration,
      Policy: policy,
      Name: params.owNamespace
    }).promise())
    if (typeof stsRes.Credentials !== 'object') {
      throw new Error(`sts.getFederationToken didn't return with Credentials, instead: [${JSON.stringify(stsRes)}]`)
    }

    return {
      accessKeyId: stsRes.Credentials.AccessKeyId,
      secretAccessKey: stsRes.Credentials.SecretAccessKey,
      sessionToken: stsRes.Credentials.SessionToken,
      expiration: stsRes.Credentials.Expiration,
      params: { Bucket: params.s3Bucket }
    }
  }
}

module.exports = { AwsS3Tvm }
