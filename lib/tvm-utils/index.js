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
const joi = require('@hapi/joi')

/**
 * @param {object} params
 * @returns {null | object} if validation failed returns error in res.error
 */
function validateParams (params, subSchema) {
  const schema = joi.object().label('params').keys({
    // default params
    // must be final params, especially the whitelist, s3Bucket, containerName and expiryDuration for security reasons
    ...subSchema,
    /// common params
    expiryDuration: joi.number().required(),
    whitelist: joi.string().required(),
    owApihost: joi.string().uri().required(),
    // those are user openwhisk credentials passed as request params
    owAuth: joi.string().required(),
    owNamespace: joi.string().required()
  }).pattern(/^$/, joi.any()).pattern(/^__ow_.+$/, joi.any()) // this means: allow all unknown parameters that start with __ow_ and ''
  // somehow the api-gateway adds a '' field to the params if no path was provided, so we allow it
  return joi.validate(params, schema)
}
// generic helpers

/**
 * @param  {string} apihost
 * @param  {string} namespace
 * @param  {string} auth
 * @returns {Promise<null | object>} if validation failed returns error in res.error
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
  return whitelist.split(',').map(ns => ns.trim()).includes(namespace)
}

module.exports = {
  isWhitelisted: isWhitelisted,
  validateParams: validateParams,
  validateOWCreds: validateOWCreds
}
