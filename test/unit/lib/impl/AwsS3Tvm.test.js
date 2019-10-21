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

const { AwsS3Tvm } = require('../../../../lib/impl/AwsS3Tvm')

const aws = require('aws-sdk')
jest.mock('aws-sdk')

// mock aws sts
const getFederationTokenPromiseMock = jest.fn()
const getFederationTokenMock = jest.fn(() => ({
  promise: getFederationTokenPromiseMock
}))
aws.STS = function () { return { getFederationToken: getFederationTokenMock } }

// mock aws s3
const createBucketPromiseMock = jest.fn()
const createBucketMock = jest.fn(() => ({
  promise: createBucketPromiseMock
}))

const headBucketPromiseMock = jest.fn()
const headBucketMock = jest.fn(() => ({
  promise: headBucketPromiseMock
}))

const putBucketTaggingPromiseMock = jest.fn()
const putBucketTaggingMock = jest.fn(() => ({
  promise: putBucketTaggingPromiseMock
}))
// const headBucketMock = () => {return new Promise(resolve => "fakeBucketName")}
aws.S3 = function () {
  return {
    headBucket: headBucketMock,
    createBucket: createBucketMock,
    putBucketTagging: putBucketTaggingMock
  }
}

// params
const fakeParams = JSON.parse(JSON.stringify(global.baseNoErrorParams))
fakeParams.bucketPrefix = 'fakeBucketPrefix'
fakeParams.region = 'fakeRegion'
fakeParams.awsAccessKeyId = 'fakeAccessKeyId'
fakeParams.awsSecretAccessKey = 'fakeSecretAccessKey'

const fakeBucketSha = 'fakeBucketPrefix-' + global.nsHash

describe('processRequest (AWS)', () => {
  // setup
  /** @type {AwsS3Tvm} */
  let tvm
  const fakeCredentials = {
    AccessKeyId: 'fakeStsAccessKeyId',
    SecretAccessKey: 'fakeStsSecretAccessKey',
    SessionToken: 'fakeStsSessionToken',
    Expiration: 'fakeStsExpiration'
  }
  beforeEach(() => {
    tvm = new AwsS3Tvm()
    getFederationTokenPromiseMock.mockReset()
    getFederationTokenMock.mockClear() // clear not reset !
    headBucketPromiseMock.mockReset()
    headBucketMock.mockClear()
    createBucketPromiseMock.mockReset()
    createBucketMock.mockClear()
    putBucketTaggingMock.mockClear()
    putBucketTaggingPromiseMock.mockReset()

    // defaults that work
    getFederationTokenPromiseMock.mockResolvedValue({
      Credentials: { ...fakeCredentials }
    })
    headBucketPromiseMock.mockResolvedValue('fakeBucketName')
    createBucketPromiseMock.mockResolvedValue({})
    putBucketTaggingPromiseMock.mockResolvedValue({})
  })

  describe('param validation', () => {
    test('when bucketPrefix is missing', async () => global.testParam(tvm, fakeParams, 'bucketPrefix', undefined))
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
          Bucket: fakeBucketSha
        }
      })

      // sts mock
      expect(getFederationTokenMock).toHaveBeenCalledTimes(1)
      expect(getFederationTokenMock).toHaveBeenCalledWith({
        DurationSeconds: fakeParams.expirationDuration,
        // policy more checks?
        Policy: expect.stringContaining('arn:aws:s3:::' + fakeBucketSha),
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
    test('when aws s3.headBucket doesnot reject', async () => {
      headBucketPromiseMock.mockResolvedValue({})
      await expectTokenGenerated()
      // expect no bucket creation
      expect(createBucketMock).toHaveBeenCalledTimes(0)
      expect(putBucketTaggingMock).toHaveBeenCalledTimes(0)
    })
    test('when aws s3.headBucket rejects with 404', async () => {
      const awsError = new Error('fake')
      awsError.statusCode = 404
      headBucketPromiseMock.mockRejectedValue(awsError)
      await expectTokenGenerated()
      expect(createBucketMock).toHaveBeenCalledWith(expect.objectContaining({ Bucket: fakeBucketSha }))
      expect(putBucketTaggingMock).toHaveBeenCalledWith(expect.objectContaining({
        Bucket: fakeBucketSha,
        Tagging: {
          TagSet: [{ Key: 'ow-namespace', Value: fakeParams.owNamespace }]
        }
      }))
    })
    test('when aws s3.headBucket rejects with !=404', async () => {
      const awsError = new Error('an aws sts error')
      awsError.statusCode = 400
      headBucketPromiseMock.mockRejectedValue(awsError)
      const response = await tvm.processRequest(fakeParams)
      global.expectServerError(response, 'an aws sts error')
    })
  })
})
