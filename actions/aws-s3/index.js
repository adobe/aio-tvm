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

// Specific utils
/**
 * Reads ./policy.json and replaces __RESOURCE_NAME__ and __USER_NAMESPACE__ placeholders
 * with parameters
 * @param  {string} resourceName
 * @param  {string} namespace
 * @returns {string}
 */
function generatePolicy (resourceName, namespace) {
  return JSON.stringify(require('./policy.json'))
    .replace(/__RESOURCE_NAME__/g, resourceName)
    .replace(/__USER_NAMESPACE__/g, namespace)
}

/**
 * @param  {string} accessKeyId aws key id of account allowed to call sts:GetFederationToken
 * @param  {string} secretAccessKey aws secret key
 * @param  {string} policy for restricting tmp tokens
 * @param  {string} username name of federated user for tokens
 * @param  {number} expiryDuration validity duration in seconds
 * @returns {Promise<object>} {accessKeyId, secretAccessKey, sessionToken, expiration}
 * @throws on error
 */
async function generateTmpAWSToken (accessKeyId, secretAccessKey, policy, username, expiryDuration) {
  const sts = new aws.STS({
    accessKeyId,
    secretAccessKey,
    apiVersion: '2011-06-15'
  })
  // When calling aws, for some errors (e.g undefined accessKeyId) the action
  // seems to hang when running in OpenWhisk. A temporary hack is to enforce a
  // timeout. An error response is correctly returned from AWS when running the
  // action locally. Todo: investigate why this doesn't work in prod
  const stsTimeout = 20000
  let timeoutId
  let stsRes
  try {
    stsRes = await Promise.race([
      sts.getFederationToken({
        DurationSeconds: expiryDuration,
        Policy: policy,
        Name: username
      }).promise().catch(e => { throw new Error(`AWS STS Error: ${e.message}`) }),
      new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`sts.getFederationToken timed out after ${stsTimeout}`)), stsTimeout)
      })
    ])
  } finally {
    clearTimeout(timeoutId)
  }
  // return error instead of throw like validation functions ?
  // in that case try/catch sts call
  if (!stsRes.Credentials) {
    throw new Error(`sts.getFederationToken didn't return with Credentials, instead: [${JSON.stringify(stsRes)}]`)
  }

  return {
    accessKeyId: stsRes.Credentials.AccessKeyId,
    secretAccessKey: stsRes.Credentials.SecretAccessKey,
    sessionToken: stsRes.Credentials.SessionToken,
    expiration: stsRes.Credentials.Expiration
  }
}

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
 * @params {string} params.s3Bucket - provided by owner, default final
 * @params {number} params.expiryDuration - provided by owner, default final
 * @params {string} params.whitelist - provided by owner, default final
 * @params {string} params.awsAccessKeyId - provided by owner, default final
 * @params {string} params.awsSecretAccessKey - provided by owner, default final
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
    const resParams = utils.validateParams(params, { s3Bucket: joi.string().required(), awsAccessKeyId: joi.string().required(), awsSecretAccessKey: joi.string().required() })
    if (resParams.error) {
      console.warn(`Bad request: ${resParams.error.message}`)
      return errorResponse(`${resParams.error.message}`, 400)
    }
    // important !! as joi accepts '123'
    params.expiryDuration = parseInt(params.expiryDuration)

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

    // 3. Get AWS tokens
    const policy = generatePolicy(params.s3Bucket, params.owNamespace)

    console.log('Policy generated')

    const tmpCreds = await generateTmpAWSToken(params.awsAccessKeyId, params.awsSecretAccessKey, policy, params.owNamespace, params.expiryDuration)

    console.log(`AWS tokens generated`)
    console.log(`End of request`)

    return {
      body: {
        ...tmpCreds,
        params: { Bucket: params.s3Bucket }
      }
    }
  } catch (e) {
    console.error(e.message)
    return errorResponse('server error', 500)
  }
}

exports.main = main
