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

const { AwsS3TVM } = require('../../../lib/impl/AwsS3TVM')

const aws = require('aws-sdk')
jest.mock('aws-sdk')

// mock aws sts
const getFederationTokenPromiseMock = jest.fn()
const getFederationTokenMock = jest.fn(() => ({
  promise: getFederationTokenPromiseMock
}))
aws.STS = function () { return { getFederationToken: getFederationTokenMock } }

// params
const fakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
fakeParams.s3Bucket = 'fakeBucket'
fakeParams.awsAccessKeyId = 'fakeAccessKeyId'
fakeParams.awsSecretAccessKey = 'fakeSecretAccessKey'

describe('processRequest (Azure Cosmos)', () => {
  // setup
  /** @type {AwsS3TVM} */
  let tvm
  const fakeCredentials = {
    AccessKeyId: 'fakeStsAccessKeyId',
    SecretAccessKey: 'fakeStsSecretAccessKey',
    SessionToken: 'fakeStsSessionToken',
    Expiration: 'fakeStsExpiration'
  }
  beforeEach(() => {
    tvm = new AwsS3TVM()
    getFederationTokenPromiseMock.mockReset()
    getFederationTokenMock.mockClear() // clear not reset !

    // defaults that work
    getFederationTokenPromiseMock.mockResolvedValue({
      Credentials: { ...fakeCredentials }
    })
  })

  describe('param validation', () => {
    test('when s3Bucket is missing', async () => global.testParam(tvm, fakeParams, 's3Bucket', undefined))
    test('when awsAccessKeyId is missing', async () => global.testParam(tvm, fakeParams, 'awsAccessKeyId', undefined))
    test('when awsSecretAccessKey is missing', async () => global.testParam(tvm, fakeParams, 'awsSecretAccessKey', undefined))
  })

  describe('token generation', () => {
    const expectTokenGenerated = async () => {
      const response = await tvm.processRequest(fakeParams)

      expect(response.statusCode).toEqual(200)
      expect(response.body).toEqual({
        accessKeyId: fakeCredentials.AccessKeyId,
        expiration: fakeCredentials.Expiration,
        secretAccessKey: fakeCredentials.SecretAccessKey,
        sessionToken: fakeCredentials.SessionToken,
        params: {
          Bucket: fakeParams.s3Bucket
        }
      })

      expect(getFederationTokenMock).toHaveBeenCalledTimes(1)
      expect(getFederationTokenMock).toHaveBeenCalledWith({
        DurationSeconds: fakeParams.expirationDuration,
        // policy more checks?
        Policy: expect.stringContaining(fakeParams.owNamespace),
        Name: fakeParams.owNamespace
      })
    }

    test('when aws sts.getFederationToken returns a valid token', expectTokenGenerated)
    test('when aws sts.getFederationToken does not return a Credentials object', async () => {
      getFederationTokenPromiseMock.mockResolvedValue({})
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'Credentials')
    })
    test('when aws sts.getFederationToken rejects', async () => {
      getFederationTokenPromiseMock.mockRejectedValue(new Error('an aws sts error'))
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'an aws sts error')
    })
  })
})
