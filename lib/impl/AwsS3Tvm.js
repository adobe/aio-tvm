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
      Resource: ['arn:aws:s3:::__RESOURCE_NAME__']
    },
    {
      Sid: 'AllowS3FolderOperations',
      Effect: 'Allow',
      Action: ['s3:PutObject', 's3:DeleteObject', 's3:PutObjectAcl', 's3:GetObject'],
      Resource: ['arn:aws:s3:::__RESOURCE_NAME__/*']
    }
  ]
}
/**
 * Replaces __RESOURCE_NAME__
 * with parameters in policy
 *
 * @param  {string} resourceName aws resource name
 * @param  {string} namespace ow namespace
 * @returns {string} stringified policy object
 */
function generatePolicy (resourceName) {
  return JSON.stringify(POLICY_TEMPLATE)
    .replace(/__RESOURCE_NAME__/g, resourceName)
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
    this._addToValidationSchema('bucketPrefix')
    this._addToValidationSchema('region')
    this._addToValidationSchema('awsAccessKeyId')
    this._addToValidationSchema('awsSecretAccessKey')
  }

  /**
   * @memberof AwsS3Tvm
   * @override
   * @private
   */
  async _generateCredentials (params) {
    //1. check and create s3 bucket
    const bucketName = await checkAndCreateS3Bucket(params.owNamespace, params.bucketPrefix, params.region)
    
    // 2. generate policy from template
    const policy = generatePolicy(bucketName, params.owNamespace)

    // 3. generate credentials
    const sts = new aws.STS({
      accessKeyId: params.awsAccessKeyId,
      secretAccessKey: params.awsSecretAccessKey,
      apiVersion: '2011-06-15'
    })
    // When calling aws, for some errors (e.g undefined accessKeyId) the action
    // seems to hang when running in OpenWhisk. A temporary hack is to enforce a
    // timeout. An error response is correctly returned from AWS when running the
    // action locally. Todo: investigate why this sometimes hangs in prod
    const stsTimeout = 20000
    let timeoutId
    let stsRes
    try {
      stsRes = await Promise.race([
        sts.getFederationToken({
          DurationSeconds: params.expirationDuration,
          Policy: policy,
          Name: params.owNamespace
        }).promise().catch(e => { throw new Error(`AWS STS Error: ${e.message}`) }),
        /* istanbul ignore next */
        new Promise((resolve, reject) => {
          /* istanbul ignore next */
          timeoutId = setTimeout(() => reject(new Error(`sts.getFederationToken timed out after ${stsTimeout}`)), stsTimeout)
        })
      ])
    } finally {
      clearTimeout(timeoutId)
    }
    if (typeof stsRes.Credentials !== 'object') {
      throw new Error(`sts.getFederationToken didn't return with Credentials, instead: [${JSON.stringify(stsRes)}]`)
    }

    return {
      accessKeyId: stsRes.Credentials.AccessKeyId,
      secretAccessKey: stsRes.Credentials.SecretAccessKey,
      sessionToken: stsRes.Credentials.SessionToken,
      expiration: stsRes.Credentials.Expiration,
      params: { Bucket: bucketName }
    }
  }
}

function checkAndCreateS3Bucket(namespace, prefix, region) {
  return new Promise((resolve, reject) => {
    var s3 = new AWS.S3({region: region});
    const bucketName = getBucketName(namespace, prefix)
    var params = {
    Bucket: bucketName
    };
    //check if bucket exists
    s3.headBucket(params, function(err, data) {
     if (err){
       if(err.statusCode == 404 ) {
         console.log("Trying to create bucket - " + bucketName)
         s3.createBucket(params, function(err, data) {
           if (err) {
             console.log("Error creating bucket - "+err)
             reject(err)
           }
           else {
             console.log("Bucket created - " + bucketName)
             resolve(bucketName)
           }
         });
       }
       else
        reject(err)
     }
     else{
       console.log("Found bucket - "+bucketName);
       resolve(bucketName)
     }
    });
  });
}

function getBucketName(namespace, prefix) {
  return prefix + "-" + md5(namespace);
}

module.exports = { AwsS3Tvm }
