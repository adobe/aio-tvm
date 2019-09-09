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
const aws = require('aws-sdk')
const joi = require('@hapi/joi')

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
 * @params {string} params.whitelist - provided by owner, default final
 * @params {string} params.awsAccessKeyId - provided by owner, default final
 * @params {string} params.awsSecretAccessKey - provided by owner, default final
 * @params {string} params.awsCFId - provided by owner, default valid default set by admin
* @params {string} params.domain - provided by owner, default valid default set by admin
 * @params {string} params.originIdPrefix - provided by owner, default valid default set by admin
 * @params {string} params.owApiHost - provided by owner, default final
 *
 * @params {string} params.owAuth - user's OpenWhisk Basic Token
 * @params {string} params.owNamespace - user's OpenWhisk Namespace
 *
 * @returns {Promise<object>} {accessKeyId, secretAccessKey, sessionToken, expiration,
 * {params: Bucket} }
 */
async function main (params) {
  try {
    // 0. validate params
    const resParams = utils.validateParams(params, { awsAccessKeyId: joi.string().required(),
      awsSecretAccessKey: joi.string().required(),
      awsCFId: joi.string().required(),
      domain: joi.string().required(),
      originIdPrefix: joi.string().required() })
    if (resParams.error) {
      console.warn(`Bad request: ${resParams.error.message}`)
      return errorResponse(`${resParams.error.message}`, 400)
    }

    console.log(`Incoming request for [ ${params.owNamespace}, ${params.owAuth.split(':')[0]} ]`)

    // 1. validate ow credentials
    const resOW = await utils.validateOWCreds(params.owApihost, params.owNamespace, params.owAuth)
    if (resOW.error) {
      console.warn(`Unauthorized request: ${resOW.error.message}`)
      return errorResponse(`unauthorized request`, 401)
    }

    // 2. Make sure namespace is whitelisted
    if (!utils.isWhitelisted(params.owNamespace, params.whitelist)) {
      console.warn(`Unauthorized request: Not whitelisted`)
      return errorResponse('unauthorized request', 401)
    }

    console.log('Request is authorized')

    // 3. Get AWS client
    const cloudFrontClient = initAWSClient(params.awsAccessKeyId, params.awsSecretAccessKey)

    console.log('CloudFront initialized')

    const result = createColudFrontConfig(cloudFrontClient, params)

    console.log(`CloudFront config created`)
    console.log(`End of request`)

    return {
      body: result
    }
  } catch (e) {
    console.error(e.message)
    return errorResponse('server error', 500)
  }
}

async function createColudFrontConfig (cloudFrontClient, params) {
  try {
    const cfDistributionConfig = await getDistributionConfig(cloudFrontClient, params.awsCFId)
    console.log('Got CloudFront Config')
    await updateDistributionConfig(cloudFrontClient, cfDistributionConfig, params)
    console.log('Updated CloudFront Config')
    return { result: 'success' }
  } catch (e) {
    console.error(e.message)
    return errorResponse('server error', 500)
  }
}

function getDistributionConfig (cloudFrontClient, awsCFId) {
  return new Promise((resolve, reject) => {
    try {
      const params = {
        Id: awsCFId
      }
      cloudFrontClient.getDistributionConfig(params, function (err, data) {
        if (err) reject(err)
        else resolve(data)
      })
    } catch (e) {
      reject(e)
    }
  })
}

function updateDistributionConfig (cloudFrontClient, oldConfig, params) {
  return new Promise((resolve, reject) => {
    try {
      const newConfig = updateConfig(oldConfig, params)
      cloudFrontClient.updateDistribution(newConfig, function (err, data) {
        if (err) reject(err)
        else resolve(data)
      })
    } catch (e) {
      reject(e)
    }
  })
}

function updateConfig (oldConfig, params) {
  var newConfig = oldConfig
  newConfig.IfMatch = newConfig.ETag
  delete newConfig['ETag']
  newConfig.Id = params.awsCFId
  newConfig.DistributionConfig.Origins.Items.push(getNewOrigin(params.owNamespace, params.domain, params.originIdPrefix))
  newConfig.DistributionConfig.Origins.Quantity = newConfig.DistributionConfig.Origins.Quantity + 1
  newConfig.DistributionConfig.CacheBehaviors.Items.push(getNewCacheBehavior(params.owNamespace, params.originIdPrefix))
  newConfig.DistributionConfig.CacheBehaviors.Quantity = newConfig.DistributionConfig.CacheBehaviors.Quantity + 1
  return newConfig
}

function getNewCacheBehavior (namespace, originIdPrefix) {
  return { PathPattern: '/' + namespace + '*',
    TargetOriginId: originIdPrefix + namespace,
    ForwardedValues:
     { QueryString: false,
       Cookies: { Forward: 'none' },
       Headers: { Quantity: 0, Items: [] },
       QueryStringCacheKeys: { Quantity: 0, Items: [] } },
    TrustedSigners: { Enabled: false, Quantity: 0, Items: [] },
    ViewerProtocolPolicy: 'https-only',
    MinTTL: 0,
    AllowedMethods:
     { Quantity: 2,
       Items: [ 'HEAD', 'GET' ],
       CachedMethods: { Quantity: 2, Items: ['HEAD', 'GET'] } },
    SmoothStreaming: false,
    DefaultTTL: 86400,
    MaxTTL: 31536000,
    Compress: false,
    LambdaFunctionAssociations: { Quantity: 0, Items: [] },
    FieldLevelEncryptionId: '' }
}

function getNewOrigin (namespace, domain, originIdPrefix) {
  return { Id: originIdPrefix + namespace,
    DomainName: domain,
    OriginPath: '/' + namespace,
    CustomOriginConfig: { HTTPPort: 80,
      HTTPSPort: 443,
      OriginProtocolPolicy: 'http-only',
      OriginSslProtocols: { Quantity: 3, Items: [ 'TLSv1', 'TLSv1.1', 'TLSv1.2' ] },
      OriginReadTimeout: 30,
      OriginKeepaliveTimeout: 5 },
    CustomHeaders: { Quantity: 0, Items: [] }
  }
}

function initAWSClient (awsAccessKeyId, awsSecretAccessKey) {
  aws.config.update({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey
  })

  aws.config.apiVersions = {
    cloudfront: '2019-03-26'
  }

  return new aws.CloudFront()
}
exports.main = main
