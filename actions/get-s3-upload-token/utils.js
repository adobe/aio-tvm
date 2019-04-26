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
const openwhisk = require('openwhisk')
const joi = require('joi')
const aws = require('aws-sdk')

// helpers specific to action

/**
 * @param {object} params
 * @returns {null | object} if validation failed returns error in res.error
 */
function validateParams (params) {
  const schema = joi.object().keys({
    // default params
    // must be final params, especially the whitelist, s3Bucket and expiryDuration for security reasons
    s3Bucket: joi.string().required(),
    expiryDuration: joi.number().required(),
    whitelist: joi.string().required(),
    awsAccessKeyId: joi.string().required(),
    awsSecretAccessKey: joi.string().required(),
    owApihost: joi.string().uri().required(),
    // those are user openwhisk credentials passed as request params
    owAuth: joi.string().required(),
    owNamespace: joi.string().required()
  }).pattern(/^__ow_.+$/, joi.any()) // this means: allow all unknown parameters that start with __ow_

  return joi.validate(params, schema)
}

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

// generic helpers

/**
 * @param  {string} apihost
 * @param  {string} namespace
 * @param  {string} auth
 * @returns {null | object} if validation failed returns error in res.error
 */
async function validateOWCreds (apihost, namespace, auth) {
  const ow = openwhisk({ api_key: auth, apihost: apihost })

  // 1. Check if ow credientials are valid by retrieving the namespace list
  //    attached to owAuth
  let nsList
  try {
    nsList = await ow.namespaces.list() // throws on auth error
  } catch (e) {
    return { error: new Error(`Openwhisk Error: ${e.message}`) }
  }

  // 2. Make sure passed namespace is attached to auth key, this is important
  //    against impersonation
  if (!nsList.includes(namespace)) {
    return { error: new Error(`Namespace ${namespace} is not linked to auth, namespaces registered to auth are [${nsList}]`) }
  }

  return { error: null }
}

/**
 * @param  {string} namespace
 * @param  {string} whitelist comma separated list of allowed namespaces or '*'
 */
function isWhitelisted (namespace, whitelist) {
  if (whitelist.trim() === '*') return true
  whitelist = whitelist.split(',').map(ns => ns.trim())
  return whitelist.includes(namespace)
}
/**
 * @param  {string} accessKeyId aws key id of account allowed to call sts:GetFederationToken
 * @param  {string} secretAccessKey aws secret key
 * @param  {string} policy for restricting tmp tokens
 * @param  {string} username name of federated user for tokens
 * @param  {number} expiryDuration validity duration in seconds
 * @returns {object} {accessKeyId, secretAccessKey, sessionToken, expiration}
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

module.exports = {
  isWhitelisted: isWhitelisted,
  validateParams: validateParams,
  validateOWCreds: validateOWCreds,
  generatePolicy: generatePolicy,
  generateTmpAWSToken: generateTmpAWSToken
}
