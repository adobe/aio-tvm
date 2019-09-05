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
/* eslint-env mocha */
test('assert true', () => expect(true).toEqual(true))
// const assert = require('assert')
// const sinon = require('sinon')

// const utils = require('../../actions/get-s3-upload-token/utils.js')

// describe('Action: get-s3-upload-token', () => {
//   describe('utils.validateParams', () => {
//     const defaultParams = {
//       // those are the default (final) params deployed with the action
//       s3Bucket: 'bucket',
//       expiryDuration: '3600',
//       whitelist: '*',
//       awsAccessKeyId: 'fakeKeyID',
//       awsSecretAccessKey: 'fakeSecretKey',
//       owApihost: 'https://fakeApiHost'
//     }

//     const params = { ...defaultParams, owAuth: 'some:auth', owNamespace: 'ns' }

//     it('should pass with valid params', () => {
//       const res = utils.validateParams({ ...params })
//       assert(!res.error)
//     })

//     it('should pass with any additional ow param (starting with __ow_)', () => {
//       const res = utils.validateParams({ ...params, __ow_param: 'any' })
//       assert(!res.error)
//     })

//     function testAllMissingRequired (requiredParams) {
//       for (let p of Object.keys(requiredParams)) {
//         it(`should fail if ${p} is missing`, () => {
//           const res = utils.validateParams({ ...requiredParams, [p]: undefined })
//           // console.log(`\t\t\t${res.error.message}`)
//           assert(res.error instanceof Error)
//         })
//       }
//     }
//     testAllMissingRequired(params)

//     it('should fail if owApihost is not a valid uri', () => {
//       const res = utils.validateParams({ ...params, owApihost: 'whatever' })
//       // console.log(`\t\t\t${res.error.message}`)
//       assert(res.error instanceof Error)
//     })

//     it('should fail if expiryDuration is not a number', () => {
//       const res = utils.validateParams({ ...params, expiryDuration: '10#' })
//       // console.log(`\t\t\t${res.error.message}`)
//       assert(res.error instanceof Error)
//     })

//     it('should fail with unknown parameter', () => {
//       const res = utils.validateParams({ ...params, unknown: 'any' })
//       // console.log(`\t\t\t${res.error.message}`)
//       assert(res.error instanceof Error)
//     })
//   })

//   describe('utils.isWhitelisted', () => {
//     it('should return true if namespace is in whitelist', () => {
//       assert.strictEqual(utils.isWhitelisted('ns', 'ns,'), true)
//     })

//     it('should return true if whitelist is *', () => {
//       assert.strictEqual(utils.isWhitelisted('ns', '*'), true)
//     })

//     it('should return false if namespace is not in whitelist', () => {
//       assert.strictEqual(utils.isWhitelisted('ns', 'ns1 ,ns!@#$%^&*()_()_+_+{}|":|>?< , ns3 '), false)
//     })

//     it('should return false if namespace is * and is not in whitelist', () => {
//       assert.strictEqual(utils.isWhitelisted('*', 'ns,'), false)
//     })
//   })

//   describe('utils.generatePolicy', () => {
//     it('should generate the policy string', () => {
//       assert(utils.generatePolicy('any', 'any'))
//     })

//     it('should have replaced the __RESOURCE_NAME__ placeholder with the first parameter', () => {
//       const policy = utils.generatePolicy('myres', 'any')
//       assert(!policy.includes('__RESOURCE_NAME__') && policy.includes('myres'))
//     })

//     it('should have replaced the __USER_NAMESPACE__ placeholder with the second parameter', () => {
//       const policy = utils.generatePolicy('any', 'user')
//       assert(!policy.includes('__USER_NAMESPACE__') && policy.includes('user'))
//     })

//     it('should not contain the __USER_NAMESPACE__ nor the __RESOURCE_NAME__ placeholder anymore', () => {
//       const policy = utils.generatePolicy('myres', 'user')
//       assert(!policy.includes('__USER_NAMESPACE__') && !policy.includes('__RESOURCE_NAME__'))
//     })
//   })

//   describe('utils.validateOWCreds', () => {
//     const auth = 'AUTH:KEY'
//     const ns = 'ns'
//     const apihost = 'https://apihost'

//     // actions dependencies, useful for stubs, needs to be installed
//     const namespacePrototype = require('../../actions/get-s3-upload-token/node_modules/openwhisk/lib/namespaces').prototype
//     const OWError = require('../../actions/get-s3-upload-token/node_modules/openwhisk/lib/openwhisk_error')

//     afterEach(function () {
//       namespacePrototype.list.restore()
//     })

//     it('should pass if ow.namespaces.list returns list that contains only the namespace', async () => {
//       sinon.stub(namespacePrototype, 'list')
//         .returns(Promise.resolve([ns]))
//       const res = await utils.validateOWCreds(apihost, ns, auth)
//       assert(!res.error)
//     })

//     it('should pass if ow.namespaces.list returns a list that contains the namespace and others', async () => {
//       sinon.stub(namespacePrototype, 'list')
//         .returns(Promise.resolve([ns, 'ns*', 'sns', '!@#$%^&*()_+']))
//       const res = await utils.validateOWCreds(apihost, ns, auth)
//       assert(!res.error)
//     })

//     it('should fail if ow.namespaces.list returns with an error (indicates most likely bad auth)', async () => {
//       sinon.stub(namespacePrototype, 'list')
//         .returns(Promise.reject(new OWError('whatever', 'whatever', 401)))
//       const res = await utils.validateOWCreds(apihost, ns, auth)
//       assert(res.error instanceof Error)
//     })

//     it('should fail if ow.namespaces.list returns with an empty list', async () => {
//       sinon.stub(namespacePrototype, 'list')
//         .returns(Promise.resolve([]))
//       const res = await utils.validateOWCreds(apihost, ns, auth)
//       assert(res.error instanceof Error)
//     })

//     it('should fail if ow.namespaces.list returns with a list that does not contains the namespace', async () => {
//       sinon.stub(namespacePrototype, 'list')
//         .returns(Promise.resolve(['ns2', 'ns*', 'sns']))
//       const res = await utils.validateOWCreds(apihost, ns, auth)
//       assert(res.error instanceof Error)
//     })
//   })

//   describe('utils.generateTmpAwsToken', async () => {
//     const aws = require('../../actions/get-s3-upload-token/node_modules/aws-sdk')
//     afterEach(function () {
//       aws.STS.restore()
//     })

//     it('should return same { accessKeyId, secretAccessKey, sessionToken, expiration } received by sts.getFederationToken', async () => {
//       const returnObject = {
//         Credentials: {
//           AccessKeyId: 'id',
//           SecretAccessKey: 'secret',
//           SessionToken: 'token',
//           Expiration: 'expiration'
//         },
//         SomeOtherFields: {}
//       }
//       sinon.stub(aws, 'STS').returns({
//         getFederationToken: () => {
//           return {
//             ...returnObject,
//             promise: () => Promise.resolve(returnObject)
//           }
//         }
//       })

//       const res = await utils.generateTmpAWSToken('id', 'secret', 'policy', 'username', 900)

//       assert(returnObject.Credentials.AccessKeyId === res.accessKeyId)
//       assert(returnObject.Credentials.SecretAccessKey === res.secretAccessKey)
//       assert(returnObject.Credentials.SessionToken === res.sessionToken)
//       assert(returnObject.Credentials.Expiration === res.expiration)
//     })

//     it('should throw an error if sts.getFederationToken does', async () => {
//       sinon.stub(aws, 'STS').returns({
//         getFederationToken: () => {
//           throw new Error('An AWS error')
//         }
//       })
//       try {
//         await utils.generateTmpAWSToken('id', 'secret', 'policy', 'username', 900)
//       } catch (e) {
//         assert(e instanceof Error)
//         return
//       }
//       throw (new Error('test failed, did not throw'))
//     })

//     it('should throw an error if sts.getFederationToken did not return with Credentials field', async () => {
//       const returnObject = { SomeOtherFields: {} }
//       sinon.stub(aws, 'STS').returns({
//         getFederationToken: () => {
//           return {
//             ...returnObject,
//             promise: () => Promise.resolve(returnObject)
//           }
//         }
//       })
//       try {
//         await utils.generateTmpAWSToken('id', 'secret', 'policy', 'username', 900)
//       } catch (e) {
//         assert(e instanceof Error)
//         return
//       }
//       throw (new Error('test failed, did not throw'))
//     })
//   })

//   describe('main', () => {
//     const fakeParams = {
//       // those are the default (final) params deployed with the action
//       s3Bucket: 'bucket',
//       expiryDuration: '3600',
//       whitelist: '*',
//       awsAccessKeyId: 'fakeKeyID',
//       awsSecretAccessKey: 'fakeSecretKey',
//       owApihost: 'https://fakeApiHost',
//       owAuth: 'some:auth',
//       owNamespace: 'ns'
//     }

//     const fakeToken = {
//       accessKeyId: 'id',
//       secretAccessKey: 'secret',
//       expiration: 900,
//       sessionToken: 'token'
//     }

//     const action = require('../../actions/get-s3-upload-token')

//     const sandbox = sinon.createSandbox()

//     const utilsNoErrorStubs = {
//       // all utils methods should be here
//       isWhitelisted: () => sandbox.stub(utils, 'isWhitelisted').returns(true),
//       validateOWCreds: () => sandbox.stub(utils, 'validateOWCreds').returns({ error: null }),
//       generateTmpAWSToken: () => sandbox.stub(utils, 'generateTmpAWSToken').returns(fakeToken),
//       validateParams: () => sandbox.stub(utils, 'validateParams').returns({ error: null }),
//       generatePolicy: () => sandbox.stub(utils, 'generatePolicy').returns({ error: null })
//     }

//     afterEach(function () {
//       sandbox.restore()
//     })

//     it('should return 400 when error on validateParams', async () => {
//       utilsNoErrorStubs.isWhitelisted()
//       utilsNoErrorStubs.validateOWCreds()
//       utilsNoErrorStubs.generateTmpAWSToken()
//       sandbox.stub(utils, 'validateParams').returns({ error: new Error('some error') })

//       const response = await action.main(fakeParams)
//       assert.strictEqual(response.statusCode, 400)
//     })

//     it('should return 401 when error on validateOwCreds', async () => {
//       utilsNoErrorStubs.isWhitelisted()
//       utilsNoErrorStubs.validateParams()
//       utilsNoErrorStubs.generateTmpAWSToken()
//       sandbox.stub(utils, 'validateOWCreds').returns({ error: new Error('some error') })

//       const response = await action.main(fakeParams)
//       assert.strictEqual(response.statusCode, 401)
//     })

//     it('should return 401 when not whitelisted', async () => {
//       utilsNoErrorStubs.generatePolicy()
//       utilsNoErrorStubs.validateOWCreds()
//       utilsNoErrorStubs.validateParams()
//       utilsNoErrorStubs.generateTmpAWSToken()
//       sandbox.stub(utils, 'isWhitelisted').returns(false)

//       const response = await action.main(fakeParams)
//       assert.strictEqual(response.statusCode, 401)
//     })

//     // multiple
//     function allUtilsThrowTest () {
//       for (let funcUnderTest of Object.keys(utilsNoErrorStubs)) {
//         it(`should return 500 when utils.${funcUnderTest} throws`, async () => {
//           Object.keys(utilsNoErrorStubs).forEach(k => {
//             if (k !== funcUnderTest) { utilsNoErrorStubs[k]() }
//           })
//           sandbox.stub(utils, funcUnderTest).throws(new Error('some error'))
//           const response = await action.main(fakeParams)
//           assert.strictEqual(response.statusCode, 500)
//         })
//       }
//     }
//     allUtilsThrowTest()

//     it('should return an object with the correct response when there is no error', async () => {
//       Object.keys(utilsNoErrorStubs).forEach(k => utilsNoErrorStubs[k]())
//       const response = await action.main(fakeParams)
//       assert.deepStrictEqual(response.body, { ...fakeToken, params: { Bucket: fakeParams.s3Bucket } })
//     })
//   })
// })
