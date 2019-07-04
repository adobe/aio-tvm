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

module.exports = {
  isWhitelisted: isWhitelisted,
  validateOWCreds: validateOWCreds
}
