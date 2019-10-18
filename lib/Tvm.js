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

const joi = require('@hapi/joi')
const openwhisk = require('openwhisk')
const logger = require('@adobe/aio-lib-core-logging')('@adobe/aio-tvm')
const crypto = require('crypto')

/**
 * @classdesc Abstract Tvm class
 * @class Tvm
 * @abstract
 */
class Tvm {
  /**
   * @memberof Tvm
   * @protected
   */
  constructor () {
    this._validationSchema = {
      /// common params
      expirationDuration: joi.number().integer().min(900).max(18000).required(),
      whitelist: joi.string().required(),
      owApihost: joi.string().uri().required(),
      // those are user openwhisk credentials passed as request params
      owNamespace: joi.string().required(),
      // owAuth is redundant here as we already check it but it cannot hurt to check twice
      owAuth: joi.string().required()
    }
  }

  /**
   * @param  {string} err error message
   * @param  {number} status http status code
   * @returns {object} { body : { error: err }, statusCode: status }
   */
  static _errorResponse (err, status) {
    return {
      body: { error: err },
      statusCode: status
    }
  }

  static _hash (str) {
    return crypto.createHash('sha256').update(str, 'binary').digest('hex').slice(32)
  }

  /**
   * Add a param to request validation schema, by default checks for string.
   *
   * @param {string} key param name
   * @param {any} [type] joi validation type, defaults to `joi.string().required()`
   * @memberof Tvm
   * @protected
   */
  _addToValidationSchema (key, type) {
    this._validationSchema[key] = type || joi.string().required()
  }

  /* **************************** PRIVATE HELPERS ***************************** */
  /**
   * @param {object} params request params
   * @returns {joi.ValidationResult} joi
   * @memberof Tvm
   * @private
   */
  _validateRequestParams (params) {
    return joi.object().label('params').keys(this._validationSchema)
      .required()
      .pattern(/^$/, joi.any()).pattern(/^__ow_.+$/, joi.any()) // this means: allow all unknown parameters that start with __ow_ and '')
      .validate(params)
  }

  /**
   * @param {string} apihost OpenWhisk apihost
   * @param {string} namespace OpenWhisk namespace
   * @param {string} auth OpenWhisk auth
   * @throws {Error} error with message if could not validate
   * @memberof Tvm
   * @private
   */
  async _validateOWCreds (apihost, namespace, auth) {
    const ow = openwhisk({ api_key: auth, apihost: apihost })

    // 1. Check if ow credientials are valid by retrieving the namespace list
    //    attached to owAuth
    let nsList
    try {
      nsList = await ow.namespaces.list() // throws on auth error
    } catch (e) {
      throw new Error(`Openwhisk Error: ${e.message}`)
    }

    // 2. Make sure passed namespace is attached to auth key, this is important
    //    against impersonation
    if (!nsList.includes(namespace)) {
      throw new Error(`Namespace ${namespace} is not part of auth, namespaces registered to auth are [${nsList}]`)
    }
  }

  /**
   * @param {string} namespace OpenWhisk namespace
   * @param {string} whitelist comma separated list of allowed namespaces or '*'
   * @throws {Error} error with message if could not validate
   * @memberof Tvm
   * @private
   */
  _validateNamespaceInWhitelist (namespace, whitelist) {
    if (whitelist.trim() !== '*' &&
      !whitelist.split(',').map(ns => ns.trim()).includes(namespace)) {
      throw new Error(`namespace ${namespace} is not whitelisted`)
    }
  }

  /* **************************** PRIVATE METHODS TO IMPLEMENT ***************************** */

  /**
   * Method to implement, returns response object with needed credentials
   *
   * @param {object} params request params
   * @returns {Promise<object>} credentials
   * @memberof Tvm
   */
  async _generateCredentials (params) {
    throw new Error('not implemented')
  }

  /* **************************** PUBLIC METHOD ***************************** */

  /**
   * Process OpenWhisk web request, generates credentials upon OpenWhisk auth validation and responds back with the credentials
   *
   * @param {object} params OpenWhisk web request params
   * @returns {Promise<object>} { body: <object>, statusCode: <number> }, if returns an error there is a body.error
   * @memberof Tvm
   */
  async processRequest (params) {
    try {
      // 1. extract OpenWhisk Auth in Authorization header
      params.owAuth = params.__ow_headers && params.__ow_headers.authorization
      if (!(params.owAuth)) {
        logger.warn(`missing authorization header for request with namespace ${params.owNamespace}`)
        return Tvm._errorResponse('missing authorization header', 401)
      }

      // 2. validation
      const res = this._validateRequestParams(params)
      if (res.error) {
        logger.warn(`bad request: ${res.error.message}`)
        return Tvm._errorResponse(res.error.message, 400)
      }
      // important - parse expiryDuration to int
      params.expirationDuration = parseInt(params.expirationDuration)

      logger.info(`incoming request for [ ${params.owNamespace}, ${params.owAuth.split(':')[0]} ]`)

      // 2. check if namespace/auth is valid
      try {
        await this._validateOWCreds(params.owApihost, params.owNamespace, params.owAuth)
        await this._validateNamespaceInWhitelist(params.owNamespace, params.whitelist)
      } catch (e) {
        logger.warn(`unauthorized request: ${e.message}`)
        return Tvm._errorResponse('unauthorized request', 403)
      }

      logger.info('request is authorized')

      // 3. generate credentials
      const credentials = await this._generateCredentials(params)

      logger.info('credentials generated')

      // 4. all good, no errors: return response
      logger.info('end of request')
      return {
        body: {
          ...credentials
        },
        statusCode: 200
      }
    } catch (e) {
      logger.error(e.message)
      return Tvm._errorResponse('server error', 500)
    }
  }
}

module.exports = { Tvm }
