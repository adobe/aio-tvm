[![Build Status](https://travis-ci.com/adobe/aio-tvm.svg?branch=master)](https://travis-ci.com/adobe/aio-tvm)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Codecov Coverage](https://img.shields.io/codecov/c/github/adobe/aio-tvm/master.svg?style=flat-square)](https://codecov.io/gh/adobe/aio-tvm/)

# Adobe I/O Token Vending Machine (TVM)

This is an implementation of a TVM delivering **temporary and restricted tokens** to access various cloud services. Users authenticate
to the TVM with their **Adobe I/O Runtime (a.k.a OpenWhisk) credentials** and are only authorized to access their own resources.

## Use

- [JavaScript NPM Client: @adobe/aio-lib-core-tvm](https://github.com/adobe/aio-lib-core-tvm#use)

- cURL

```bash
curl -H "Authorization: ${AUTH}" "https://adobeio.adobeioruntime.net/apis/tvm/azure/blob/${NAMESPACE}"
curl -H "Authorization: ${AUTH}" "https://adobeio.adobeioruntime.net/apis/tvm/azure/cosmos/${NAMESPACE}"
curl -H "Authorization: ${AUTH}" "https://adobeio.adobeioruntime.net/apis/tvm/aws/s3/${NAMESPACE}"
```

## Explore

`goto` [API](https://opensource.adobe.com/aio-tvm/docs/api.html)

## Deprecated endpoints (not part of API)

- Get AWS S3 token `https://adobeioruntime.net/api/v1/web/adobeio/tvm/get-s3-upload-token` is still accessible (POST and GET) with params `{"owAuth": "<myauth>", "owNamespace": "<mynamespace>"}`

## Deploy your own TVM

### Why

You want to share a cloud service that you own (e.g 1 S3 account) with a set of OpenWhisk namespaces and you want to
make sure that each namespace has access only to the resources they own (e.g can only see their S3 blobs).

This might be useful for you if:

- You have multiple Adobe I/O Runtime namespaces and you need them to access a cloud service but you don't want to use
  the one exposed by Adobe's TVM
- You are an OpenWhisk provider and want to provide an easy access to an external cloud service (e.g. storage)

### Setup

- `npm install -g @adobe/aio-cli`
- `npm install`

### Deployment Config

- `.env`:

  ```bash
  AIO_RUNTIME_APIVERSION=v1
  AIO_RUNTIME_APIHOST=https://adobeioruntime.net
  AIO_RUNTIME_NAMESPACE=<deployment_ns>
  AIO_RUNTIME_AUTH=<deployment_auth_ns>

  EXPIRATION_DURATION=<token expiration in seconds>
  APPROVED_LIST=<comma separated list of namespaces>

  AWS_ACCESS_KEY_ID=<key id of IAM user created in AWS>
  AWS_SECRET_ACCESS_KEY=<secret of IAM user created in AWS>
  AWS_REGION=us-east-1
  S3_BUCKET=<MY_BUCKET>

  AZURE_STORAGE_ACCOUNT=<storage account name>
  AZURE_STORAGE_ACCESS_KEY=<storage access key>

  AZURE_COSMOS_ACCOUNT=<cosmosdb account name>
  AZURE_COSMOS_MASTER_KEY=<cosmosdb master key>
  AZURE_COSMOS_DATABASE_ID=<cosmosdb database name>
  AZURE_COSMOS_CONTAINER_ID=<cosmosdb database name>

  # for functional tests only
  TEST_NAMESPACE_1=<test ns 1>
  TEST_AUTH_1=<test auth 1>
  TEST_NAMESPACE_2=<test ns 2>
  TEST_AUTH_2=<test auth ns 2>
  ```

- Use the `APPROVED_LIST` variable to control which namespace can access the TVM and
  hence who can deploy files to your S3 Bucket.
  - **[ ⚠️ NOT RECOMMENDED ⚠️]** Use `APPROVED_LIST=*` to allow access to
    **every** OpenWhisk namespace in the same domain.

### Setup Azure Blob

- Create a storage account
- Retrieve the access key
- Fill `AZURE_STORAGE_*` variables in `.env`

### Setup Azure CosmosDB

- Create a cosmos account
- Click on `+ Add Container`:
  - specify a database name
  - specify a container name
  - specify a partitionKey: call it **`/partitionKey`** => the name is important
  - create the container
- Configure the newly created container to have **ttl** set to **on**
- Retrieve the account master key and set `AZURE_COSMOS_MASTER_KEY`

### Setup AWS S3

- Create a Bucket in S3 that will host the app folders
- Create an IAM user with the following IAM policy in AWS, replace `MY_BUCKET` with your bucket name:

  ```json
    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "AllowTokenDelivery",
          "Effect": "Allow",
          "Action": "sts:GetFederationToken",
          "Resource": "*"
        },
        {
          "Sid": "AllowS3",
          "Effect": "Allow",
          "Action": [
              "s3:PutObject",
              "s3:DeleteObject",
              "s3:PutObjectAcl",
              "s3:ListBucket",
          ],
          "Resource": [
            "arn:aws:s3:::MY_BUCKET/*",
            "arn:aws:s3:::MY_BUCKET"
          ]
        }
      ]
    }
  ```

- Configure the `.env` file, see [config](#deployment-config)

### Deploy the TVM endpoints

- **you likely need to undeploy first to refresh the I/O Runtime Api GW**

- `aio rt api delete tvm && aio app deploy` will deploy all TVM endpoints to the OpenWhisk namespace configured in `.env`.

### Undeploy

- `aio app undeploy` to undeploy

### Release a new version

- `npm run release` will run tests, bump up the version and deploy all TVM endpoints to the OpenWhisk namespace configured in `.env`.
- note: this command will run functional tests and will need you to have additional OpenWhisk test namespaces setup up in your `.env` (see [config](#deployment-config))

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
