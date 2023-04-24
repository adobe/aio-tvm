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

const joi = require('joi')
const openwhisk = require('openwhisk')
const logger = require('@adobe/aio-lib-core-logging')('@adobe/aio-tvm')
const crypto = require('crypto')
const { posix } = require('path')
const { Ims } = require('@adobe/aio-lib-ims')
const LRU = require('lru-cache')
const fetch = require('node-fetch')
const { setMetricsURL, incBatchCounter } = require('@adobe/aio-metrics-client')
const METRICS_KEY = 'recordtvmmetrics'

// cache 1000 valid GW tokens for 5 mins
// note that invalidated tokens will be valid for 5 minutes, this should be readjusted if
// the API GW performs some meaningful validation in the future.
const validApiGWTokensCache = new LRU({ max: 1000, maxAge: 5 * 60 * 1000 })

const KNOWN_4XX_ERRORS = [
  400,
  401,
  403
]

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
      /// deployment params - should not be setable by request - deployed as final
      expirationDuration: joi.number().integer().min(600).max(18000).required(),
      approvedList: joi.string().required(),
      owApihost: joi.string().uri().required(),
      disableAdobeIOApiGwTokenValidation: joi.string().allow('').optional(),
      imsEnv: joi.string().allow('').optional(),
      metricsUrl: joi.string().allow('').optional(),
      denyListUrl: joi.string().allow('').optional(),

      // those are user openwhisk credentials passed as request params
      owNamespace: joi.string().min(3).max(63).required(),
      owAuth: joi.string().required()
    }
  }

  /**
   * @param  {string} err error message
   * @param  {number} status http status code
   * @private
   * @returns {object} { body : { error: err }, statusCode: status }
   */
  static _userErrorResponse (err, status) {
    // note we don't wrap the error in the { error } object so that those won't be
    // reflected as application errors in the I/O Runtime application logs
    return {
      body: { error: err },
      statusCode: status
    }
  }

  /**
   * @param {string} str input
   * @returns {string} truncated sha256 hash
   * @private
   */
  static _hash (str) {
    // slice 32 because of s3 and azure blob taking only 63 char names
    return crypto.createHash('sha256').update(str, 'binary').digest('hex').slice(0, 32)
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

  /**
   * Validate namespace against Deny List
   *
   * @param {string} denyListUrl deny list URL
   * @param {string} namespace Namespace to be validated
   * @param {number} expirationDuration expiry in seconds
   * @returns {void}
   * @memberof Tvm
   * @protected
   */
  async _validateServiceBasedDenyList (denyListUrl, namespace, expirationDuration) {
    if (denyListUrl) {
      let denyList
      try {
        if (Tvm.inMemoryCache.expiry > Date.now()) {
          denyList = Tvm.inMemoryCache.denyList // use deny list from in-memory cache
        } else {
          denyList = await this._fetchDenyList(denyListUrl) // fetch deny list from URL
          Tvm.inMemoryCache.denyList = denyList
          Tvm.inMemoryCache.expiry = new Date(Date.now() + (5 * 60000)).valueOf() // refresh list every 5 minutes
        }
      } catch (e) {
        // Ignore and log any errors while checking deny list
        logger.warn('Error while fetching deny list')
        logger.error(e)
      }
      await this._processDenyList(denyList, namespace, expirationDuration)
    } else {
      logger.info('No deny list set')
    }
  }

  /* **************************** PRIVATE HELPERS ***************************** */

  /**
   * @param {object} params requestParams
   * @param {string} headerName header name e.g. 'authorization'
   * @param {string} tokenPrefix token header prefix e.g 'Bearer'
   * @returns {string} the extracted token
   * @memberof Tvm
   * @private
   */
  _extractTokenFromHeader (params, headerName, tokenPrefix) {
    const headerNameLC = headerName.toLowerCase()
    const tokenHeader = params.__ow_headers && params.__ow_headers[headerNameLC]
    if (!tokenHeader) {
      throw new Error(`missing ${headerName} header`)
    }
    const token = tokenHeader.split(tokenPrefix)[1]
    if (!token) {
      throw new Error(`${headerName} header is not a valid ${tokenPrefix.trim()} token`)
    }
    return token
  }

  /**
   * @param {object} params request params
   * @returns {joi.ValidationResult} joi
   * @memberof Tvm
   * @private
   */
  _validateRequestParams (params) {
    return joi.object().label('params').keys(this._validationSchema)
      .required()
      .pattern(/^$/, joi.any()).pattern(/^__ow_.+$/, joi.any()) // this means allow all unknown parameters that start with __ow_ and ''
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
      const error = new Error(`Openwhisk Error: ${e.message}`)
      error.code = e.statusCode
      throw error
    }
    // 2. Make sure passed namespace is attached to auth key, this is important
    //    against impersonation
    if (!nsList.includes(namespace)) {
      const error = Error(`Namespace ${namespace} is not part of auth, namespaces registered to auth are [${nsList}]`)
      error.code = 403
      throw error
    }
  }

  /**
   * @param {string} namespace OpenWhisk namespace
   * @param {string} approvedList comma separated list of allowed namespaces or '*'
   * @throws {Error} error with message if could not validate
   * @memberof Tvm
   * @private
   */
  _validateNamespaceInApprovedList (namespace, approvedList) {
    if (approvedList.trim() !== '*' &&
      !approvedList.split(',').map(ns => ns.trim()).includes(namespace)) {
      const error = new Error(`namespace ${namespace} is not approved`)
      error.code = 403
      throw error
    }
  }

  /**
   * Validates the Adobe I/O API Gateway service signature token.
   * The validation is performed online against IMS. Valid token are cached for 5 minutes.
   *
   * @param {object} params request params
   * @returns {joi.ValidationResult} joi
   * @memberof Tvm
   * @private
   */
  async _validateAdobeIOApiGwServiceToken (params) {
    // constants
    const REQUIRED_HEADER = 'x-gw-ims-authorization'
    const REQUIRED_SCOPES = ['openid', 'AdobeID', 'system']
    const REQUIRED_CLIENT_ID = 'AnsApiPlatform1'

    // ims env
    const imsEnv = params.imsEnv || 'prod'

    // attempt to extract Bearer token from header
    const token = this._extractTokenFromHeader(params, REQUIRED_HEADER, 'Bearer ')

    // if the token is in the valid cache, no need to check
    const cacheKey = imsEnv + token
    if (validApiGWTokensCache.get(cacheKey)) {
      return
    }

    // validation
    // 1. check if the token is valid
    const ims = new Ims(imsEnv)
    const res = await ims.validateToken(token)
    if (!res.valid) {
      throw new Error('invalid IMS token')
    }
    // 2. check client id
    if (res.token.client_id !== REQUIRED_CLIENT_ID) {
      throw new Error(`token client_id '${res.token.client_id}' is not allowed`)
    }
    // 3. check scopes
    const scopes = res.token.scope.split(',')
    const missing = []
    REQUIRED_SCOPES.forEach(rs => {
      if (!scopes.includes(rs)) {
        missing.push(rs)
      }
    })
    if (missing.length > 0) {
      throw new Error(`token is missing required scopes '${missing.toString()}'`)
    }
    // if the token is valid, cache it
    validApiGWTokensCache.set(cacheKey, true)
  }

  /**
   * Fetch Deny List from URL
   *
   * @param {string} url deny list url
   * @returns {object} deny list object
   * @memberof Tvm
   * @private
   */
  async _fetchDenyList (url) {
    const resp = await fetch(url)
    const body = await resp.text()
    if (resp.ok) {
      return JSON.parse(body)
    } else {
      logger.warn('Error while fetching deny list - ' + body)
    }
    return {} // return an empty list
  }

  /**
   * Check deny list update timestamp against expiry time
   *
   * @param {number} timestamp timestamp when list got updated
   * @param {number} expiryDurationInSeconds expiry for deny list
   * @returns {boolean} true/false based on timestamp check
   * @memberof Tvm
   * @private
   */
  _checkDenyListTimestamp (timestamp, expiryDurationInSeconds) {
    return ((new Date(timestamp + (expiryDurationInSeconds * 1000))).valueOf() > Date.now())
  }

  /**
   * Send metrics.
   *
   * @param {object} namespace requested owNamespace
   * @param {string} metricName metric name
   * @param {string} metricLabel metric label
   * @memberof Tvm
   * @private
   */
  track (namespace, metricName, metricLabel) {
    incBatchCounter(metricName, namespace, metricLabel)
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

  /**
   * Process Deny List
   *
   * @param {object} denyList deny list object
   * @param {string} namespace namespace to be validated
   * @param {number} expiryDuration expiry in seconds
   * @returns {void}
   * @memberof Tvm
   */
  async _processDenyList (denyList, namespace, expiryDuration) {
    // Ignore and Do Nothing. Let Individual Services impl define their own processing.
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
    const requestId = params.__ow_headers['x-request-id']
    logger.info(`start, namespace - ${params.owNamespace} - request Id - ${requestId}`)

    if (params.metricsUrl) {
      try {
        const url = new URL(params.metricsUrl)
        url.pathname = posix.join(url.pathname, METRICS_KEY)
        setMetricsURL(url.href)
      } catch (ex) {
        console.log('Creating metrics url failed : ', params.metricsUrl)
      }
    }

    try {
      // extract OpenWhisk Auth in Authorization header
      try {
        const rawToken = this._extractTokenFromHeader(params, 'authorization', 'Basic ')
        params.owAuth = Buffer.from(rawToken, 'base64').toString()
      } catch (e) {
        logger.warn(`failed to extract Basic auth token: ${e.message} - namespace - ${params.owNamespace} - request Id - ${requestId}`)
        this.track(params.owNamespace, 'user_error_count', '403')
        return Tvm._userErrorResponse('unauthorized', 403)
      }

      // validate request params
      const res = this._validateRequestParams(params)
      if (res.error) {
        logger.warn(`bad request: ${res.error.message} - namespace - ${params.owNamespace} - request Id - ${requestId}`)
        this.track(params.owNamespace, 'user_error_count', '400')
        return Tvm._userErrorResponse(res.error.message, 400)
      }
      // important - parse expiryDuration to int
      params.expirationDuration = parseInt(params.expirationDuration)

      // validate Adobe I/O Api Gateway service token
      if (params.disableAdobeIOApiGwTokenValidation !== 'true') {
        try {
          await this._validateAdobeIOApiGwServiceToken(params)
        } catch (e) {
          logger.warn(`Adobe I/O API Gateway service token validation failed: ${e.message} - namespace - ${params.owNamespace} - request Id - ${requestId}`)
          this.track(params.owNamespace, 'user_error_count', '403')
          return Tvm._userErrorResponse('unauthorized', 403)
        }
      }

      logger.info(`trying to validate credentials: [ ${params.owNamespace}, ${params.owAuth.split(':')[0]}<hidden> ] - request Id - ${requestId}`)

      // check if namespace/auth is valid
      try {
        await this._validateOWCreds(params.owApihost, params.owNamespace, params.owAuth)
        await this._validateNamespaceInApprovedList(params.owNamespace, params.approvedList)
        await this._validateServiceBasedDenyList(params.denyListUrl, params.owNamespace, params.expirationDuration)
        this.track(params.owNamespace, 'request_count')
      } catch (e) {
        if (e.code) {
          if (KNOWN_4XX_ERRORS.includes(e.code)) {
            logger.warn(`unauthorized request: ${e.message} - namespace - ${params.owNamespace} - request Id - ${requestId}`)
            this.track(params.owNamespace, 'user_error_count', '403')
            return Tvm._userErrorResponse('unauthorized request', 403)
          } else if (e.code === 429) {
            logger.warn(`throttled request: ${e.message} - namespace - ${params.owNamespace} - request Id - ${requestId}`)
            this.track(params.owNamespace, 'user_error_count', '429')
            return Tvm._userErrorResponse(`throttled request - ${e.message}`, 429)
          }
        }
        logger.warn(`server error: ${e.message} - request Id - ${requestId}`)
        // return 500 error if its not a known 4xx error or no e.code set
        this.track(params.owNamespace, 'error_count', '500')
        return Tvm._userErrorResponse('server error', 500)
      }

      logger.info(`request is authorized - namespace - ${params.owNamespace} - request Id - ${requestId}`)

      // 3. generate credentials
      const credentials = await this._generateCredentials(params)

      logger.info(`credentials generated - namespace - ${params.owNamespace} - request Id - ${requestId}`)

      // 4. all good, no errors: return response
      logger.info(`end, namespace - ${params.owNamespace} - request Id - ${requestId}`)
      return {
        body: {
          ...credentials
        },
        statusCode: 200
      }
    } catch (e) {
      logger.error(e)
      this.track(params.owNamespace, 'error_count', '500')
      // note the error is wrapped in the { error } object, this means that any 500 will
      // appear in the I/O Runtime activation logs as an application error
      return {
        error: {
          body: { error: 'server error' },
          statusCode: 500
        }
      }
    }
  }
}

Tvm.inMemoryCache = {}

module.exports = { Tvm }
