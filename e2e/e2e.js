const execa = require('execa')
const fetch = require('node-fetch').default

jest.setTimeout(150000)

const deployNamespace = process.env.TEST_NAMESPACE_1
const deployAuth = process.env.TEST_AUTH_1
const testNamespace = process.env.TEST_NAMESPACE_2
const testAuth = process.env.TEST_AUTH_2

if (process.env.AIO_RUNTIME_APIHOST.endsWith('/')) process.env.AIO_RUNTIME_APIHOST = process.env.AIO_RUNTIME_APIHOST.slice(0, -1)
const host = 'https://' + deployNamespace + '.' + process.env.AIO_RUNTIME_APIHOST.split('https://')[1]

const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const deployActions = async () => {
  // !! important the whitelist includes the testNamespace but not the deployNamespace which we will use to test that
  // !! the whitelisting works. Alternatively, we could redeploy w/ diff whitelists b/w test, but it takes too much time
  process.env.WHITELIST = `${testNamespace}, fakeNS1,fakeNS2,`
  process.env.EXPIRATION_DURATION = 3600

  // test auth 1 is deploying
  process.env.AIO_RUNTIME_AUTH = deployAuth
  process.env.AIO_RUNTIME_NAMESPACE = deployNamespace

  // assumes that all other env vars are set
  console.error('deploying tvm..')
  await execa('npm', ['run', 'deploy'], { stderr: 'inherit' })
  await waitFor(20000) // need to wait for api to be ready
  console.error('done deploying tvm')
}

const undeployActions = async () => {
  process.env.AIO_RUNTIME_AUTH = deployAuth
  process.env.AIO_RUNTIME_NAMESPACE = deployNamespace

  // assumes that all other env vars are set
  console.error('undeploying tvm..')
  await execa('npm', ['run', 'undeploy'], { stderr: 'inherit' })
  console.error('done undeploying tvm')
}

const sendRequest = async (url, headers) => {
  const response = await fetch(url, { headers }) // { 'Authorization': auth }
  if (response.ok) return response.json()
  const errorBody = await response.text()
  const e = new Error(errorBody)
  e.status = response.status
  e.type = 'BAD_HTTP_STATUS'
  throw e
}

const endpoints = {
  awsS3: '/apis/tvm/aws/s3',
  azureCosmos: '/apis/tvm/azure/cosmos',
  azureBlob: '/apis/tvm/azure/blob'
}

const buildURL = (endpoint, namespace, queryStr) => host + endpoint + '/' + namespace + (queryStr ? '?' + queryStr : '')

const expectBadStatus = async (status, endpoint, namespace, headers, queryStr) => {
  let err
  try {
    const res = await sendRequest(buildURL(endpoint, namespace, queryStr), headers)
    console.error(res)
  } catch (e) {
    err = e
    expect({ message: e.message, type: e.type, status: e.status })
      .toEqual({ status, type: 'BAD_HTTP_STATUS', message: e.message }) // leave message for better debug from jest error
  }
  expect(err).toBeInstanceOf(Error)
}

const expectedAwsS3Response = {
  params: { Bucket: expect.any(String) },
  accessKeyId: expect.any(String),
  secretAccessKey: expect.any(String),
  sessionToken: expect.any(String),
  expiration: expect.any(String)
}

const expectedAzureBlobResponse = {
  sasURLPrivate: expect.any(String),
  sasURLPublic: expect.any(String),
  expiration: expect.any(String)
}

const expectedAzureCosmosResponse = {
  endpoint: expect.any(String),
  resourceToken: expect.any(String),
  databaseId: expect.any(String),
  containerId: expect.any(String),
  partitionKey: expect.any(String),
  expiration: expect.any(String)
}

beforeEach(async () => {
  expect.hasAssertions()
})

beforeAll(async () => {
  await deployActions() // very long..
})
afterAll(async () => {
  await undeployActions()
})
describe('e2e workflows', () => {
  test('aws s3 e2e test: get tvm credentials, list s3 blobs in namespace (success), list s3 blobs in other namespace (fail), list s3 buckets (fail)', async () => {
    const tvmResponse = await sendRequest(buildURL(endpoints.awsS3, testNamespace), { Authorization: testAuth })
    expect(tvmResponse).toEqual(expectedAwsS3Response)

    const aws = require('aws-sdk')
    const s3 = new aws.S3(tvmResponse)

    const res = await s3.listObjectsV2({ Prefix: testNamespace + '/' }).promise()
    expect(res.$response.httpResponse.statusCode).toEqual(200)

    try {
      await s3.listObjectsV2({ Prefix: deployNamespace + '/' }).promise()
    } catch (e) {
      // keep message for more info
      expect({ code: e.code, message: e.message }).toEqual({ code: 'AccessDenied', message: e.message })
    }

    try {
      await s3.listBuckets().promise()
    } catch (e) {
      // keep message for more info
      expect({ code: e.code, message: e.message }).toEqual({ code: 'AccessDenied', message: e.message })
    }
  })
  test('azure blob e2e test: get tvm credentials, list s3 blobs public and private container (success)', async () => {
    const tvmResponse = await sendRequest(buildURL(endpoints.azureBlob, testNamespace), { Authorization: testAuth })
    expect(tvmResponse).toEqual(expectedAzureBlobResponse)

    const azure = require('@azure/storage-blob')
    const azureCreds = new azure.AnonymousCredential()
    const pipeline = azure.StorageURL.newPipeline(azureCreds)
    const containerURLPrivate = new azure.ContainerURL(tvmResponse.sasURLPrivate, pipeline)
    const containerURLPublic = new azure.ContainerURL(tvmResponse.sasURLPublic, pipeline)

    const listContainerOk = async (containerURL) => {
      const response = await containerURL.listBlobFlatSegment(azure.Aborter.none)
      expect(response._response.status).toEqual(200)
    }

    await listContainerOk(containerURLPrivate)
    await listContainerOk(containerURLPublic)
  })

  test('azure cosmos e2e test: get tvm credentials, add item + delete (success), add item in other partitionKey (fail), add item in other container (fail), add item in other db (fail)', async () => {
    const tvmResponse = await sendRequest(buildURL(endpoints.azureCosmos, testNamespace), { Authorization: testAuth })
    expect(tvmResponse).toEqual(expectedAzureCosmosResponse)

    const cosmos = require('@azure/cosmos')
    const client = new cosmos.CosmosClient({ endpoint: tvmResponse.endpoint, tokenProvider: async () => tvmResponse.resourceToken })

    const database = client.database(tvmResponse.databaseId)
    const container = database.container(tvmResponse.containerId)
    const key = 'test-key'
    const value = { some: 'value' }

    // 1. OK
    const item = (await container.items.upsert({ id: key, partitionKey: tvmResponse.partitionKey, value }))
    expect(item.statusCode).toBeLessThan(300)
    expect(item.statusCode).toBeGreaterThanOrEqual(200)
    await container.item(key, tvmResponse.partitionKey).delete()

    // 2. forbidden database
    const badDatabase = client.database('someotherId')
    const containerBadDB = badDatabase.container(tvmResponse.containerId)
    try {
      await containerBadDB.items.upsert({ id: key, partitionKey: tvmResponse.partitionKey, value })
    } catch (e) {
      expect(e.code).toEqual(403)
    }

    // 3. forbidden container
    const badContainer = database.container('someotherId')
    try {
      await badContainer.items.upsert({ id: key, partitionKey: tvmResponse.partitionKey, value })
    } catch (e) {
      expect(e.code).toEqual(403)
    }

    // 4. forbidden partitionKey
    try {
      await badContainer.items.upsert({ id: key, partitionKey: 'someotherKey', value })
    } catch (e) {
      expect(e.code).toEqual(403)
    }
  })
})

describe('e2e errors', () => {
  describe('auth related errors', () => {
    test('missing auth', async () => {
      await Promise.all(Object.values(endpoints).map(e => {
        return expectBadStatus(401, e, testNamespace, undefined)
      }))
    })
    test('valid auth but not associated to namespace', async () => {
      await Promise.all(Object.values(endpoints).map(e => {
        return expectBadStatus(403, e, testNamespace, { Authorization: deployAuth })
      }))
    })
    test('bad auth header format', async () => {
      await Promise.all(Object.values(endpoints).map(e => {
        return expectBadStatus(403, e, testNamespace, { Authorization: 'Bearer ' + testAuth }) // as of now type of auth not supported
      }))
    })
  })
  test('test non whitelisted namespace', async () => {
    await Promise.all(Object.values(endpoints).map(e => {
      return expectBadStatus(403, e, deployNamespace, { Authorization: deployAuth }) // ns and auth are valid but ns is not whitelisted => 403
    }))
  })
  test('test status=400 when request attempts to override final parameters', async () => {
    // 1. final params common to all endpoints
    const commonFinalParamOverwrite = [
      'expirationDuration=100000',
      'whitelist=*',
      'owApiHost=https://mallorys-openwhisk-deployment.com',
      '__ow_headers=bad' // we must make sure that __ow* vars are safe as well (should be covert by OW)
    ]
    const promises = commonFinalParamOverwrite.map(qs => Object.values(endpoints).map(e => {
      return expectBadStatus(400, e, testNamespace, { Authorization: testAuth }, qs)
    })).reduce((reduced, arr) => reduced.concat(arr), [])
    await Promise.all(promises)

    // 2. aws s3 specific
    let params = ['s3Bucket=badBucket', 'awsSecretAccessKey=fakeKey', 'awsAccessKeyId=fakeId']
    await Promise.all(params.map(qs => expectBadStatus(400, endpoints.awsS3, testNamespace, { Authorization: testAuth }, qs)))

    // 3. cosmos
    params = ['azureCosmosAccount=badAccount', 'azureCosmosDatabaseId=badDatabaseId', 'azureCosmosContainerId=badContainer', 'azureCosmosMasterKey=fakeKey']
    await Promise.all(params.map(qs => expectBadStatus(400, endpoints.azureCosmos, testNamespace, { Authorization: testAuth }, qs)))

    // 4. azure blob
    params = ['azureStorageAccount=fakeAccount', 'azureStorageAccessKey=fakeKey']
    await Promise.all(params.map(qs => expectBadStatus(400, endpoints.azureBlob, testNamespace, { Authorization: testAuth }, qs)))
  })
  test('test status=400 when passing a non allowed parameter', async () => {
    await Promise.all(Object.values(endpoints).map(e => {
      return expectBadStatus(400, e, testNamespace, { Authorization: testAuth }, 'someNotAllowedParam=IamMalicious')
    }))
  })
  test('test status=404 when using a bad enpoint', async () => {
    return expectBadStatus(404, '/bad/endpoint', testNamespace, { Authorization: testAuth })
  })
})
