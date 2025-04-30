/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const fetch = require('node-fetch')
const Crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const xmlJS = require('xml-js')

const azure = require('@azure/storage-blob')

/**
 * Sign Request
 *
 * @param {string} method http method
 * @param {string} resource azure resource to be used
 * @param {string }date Date string
 * @param {string} storageAccessKey access Key
 * @returns {string} signed request
 */
function _signRequest (method, resource, date, storageAccessKey) {
  const canonicalHeaders = 'x-ms-date:' + date + '\n' + 'x-ms-version:2019-02-02'
  const stringToSign = method + '\n\n\n\n\n\n\n\n\n\n\n\n' + canonicalHeaders + '\n' + resource
  return Crypto.createHmac('sha256', Buffer.from(storageAccessKey, 'base64')).update(stringToSign, 'utf8').digest('base64')
}

/**
 * Get Access policy
 *
 * @param {object} containerURL azure container URL
 * @param {string} storageAccount azure account
 * @param {string} storageAccessKey azure access key
 * @returns {string} Id for access policy
 */
async function getAccessPolicy (containerURL, storageAccount, storageAccessKey) {
  // use API call as this._azure.containerURL.getAccessPolicy calls fails for policy with empty permissions
  const index = containerURL.url.lastIndexOf('/')
  const containerName = containerURL.url.substring(index + 1, containerURL.url.length)

  const resource = '/' + storageAccount + '/' + containerName + '\ncomp:acl\nrestype:container'
  const date = new Date().toUTCString()
  const sign = _signRequest('GET', resource, date, storageAccessKey)

  const reqHeaders = {
    'x-ms-date': date,
    'x-ms-version': '2019-02-02',
    authorization: 'SharedKey ' + storageAccount + ':' + sign
  }
  const url = containerURL.url + '?restype=container&comp=acl'
  const res = await fetch(url, { method: 'GET', headers: reqHeaders })

  const acl = await res.text()
  const aclObj = xmlJS.xml2js(acl)
  let id
  if (aclObj.elements) {
    const signedIdentifiers = aclObj.elements[0]
    if (signedIdentifiers.elements) {
      const signedIdentifier = signedIdentifiers.elements[0].elements
      signedIdentifier.forEach(function (val, index, arr) {
        if (val.name === 'Id') {
          id = val.elements[0].text
          return id
        }
      })
    }
  }
  return id
}

/**
 * Set new access policy
 *
 * @param {azure.ContainerURL} containerURL azure container URL
 * @param {boolean} publicAccess set to true if public access is needed
 * @returns {void}
 */
async function setAccessPolicy (containerURL, publicAccess = false) {
  const id = uuidv4()
  const idPublic = uuidv4()
  // set access policy with new id and without any permissions
  // this will remove all other policies and also reset the access or ACL, hence we need to make sure to keep access:blob for the public container.
  if (publicAccess) {
    return containerURL.setAccessPolicy(azure.Aborter.none, 'blob', [{ id: idPublic, accessPolicy: { permission: '' } }])
  }
  await containerURL.setAccessPolicy(azure.Aborter.none, undefined, [{ id, accessPolicy: { permission: '' } }])
}

/**
 * Add new access policy if it doest not exists
 *
 * @param {azure.ContainerURL} containerURL azure container URL
 * @param {string} storageAccount azure account
 * @param {string} storageAccessKey azure access key
 * @param {boolean} publicAccess set to true if public access is needed
 * @returns {void}
 */
async function addAccessPolicyIfNotExists (containerURL, storageAccount, storageAccessKey, publicAccess = false) {
  const identifier = await getAccessPolicy(containerURL, storageAccount, storageAccessKey)
  if (!identifier) {
    await setAccessPolicy(containerURL, publicAccess)
  }
}

/**
 * Get Container URL
 *
 * @param {string} accountURL account URL
 * @param {object} sharedKeyCredential azure sharedKeyCredential object
 * @param {string} containerName azure container name
 * @returns {object} container URL object
 */
function getContainerURL (accountURL, sharedKeyCredential, containerName) {
  const pipeline = azure.StorageURL.newPipeline(sharedKeyCredential)
  const serviceURL = new azure.ServiceURL(accountURL, pipeline)
  return azure.ContainerURL.fromServiceURL(serviceURL, containerName)
}

module.exports = {
  getAccessPolicy,
  setAccessPolicy,
  addAccessPolicyIfNotExists,
  getContainerURL
}
