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

const utils = require('./utils.js')

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
 * @params {string} params.s3Bucket - privided by owner, default final
 * @params {number} params.expiryDuration - privided by owner, default final
 * @params {string} params.whitelist - privided by owner, default final
 * @params {string} params.awsAccessKeyId - privided by owner, default final
 * @params {string} params.awsSecretAccessKey - privided by owner, default final
 * @params {string} params.owApiHost - privided by owner, default final
 *
 * @params {string} params.owAuth - user's OpenWhisk Basic Token
 * @params {string} params.owNamespace - user's OpenWhisk Namespace
 *
 * @returns {object} {accessKeyId, secretAccessKey, sessionToken, expiration,
 * {params: Bucket} }
 */
async function main (params) {
  try {
    // 0. validate params
    const resParams = utils.validateParams(params)
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

    // 3. Get AWS tokens
    const policy = utils.generatePolicy(params.s3Bucket, params.owNamespace)

    console.log('Policy generated')

    const tmpCreds = await utils.generateTmpAWSToken(params.awsAccessKeyId, params.awsSecretAccessKey, policy, params.owNamespace, params.expiryDuration)

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
