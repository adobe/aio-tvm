[![Build Status](https://travis-ci.com/adobe/aio-tvm.svg?branch=master)](https://travis-ci.com/adobe/aio-tvm)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

# Adobe I/O Token Vending Machine (TVM)

This is an implementation of a TVM delivering **temporary and restricted tokens** to access various cloud services. Users authenticate
to the TVM with their **Adobe I/O Runtime (a.k.a OpenWhisk) credentials** and are only authorized to access their own resources.

## Use

- [JavaScript NPM Client: @adobe/aio-lib-core-tvm](https://github.com/adobe/aio-lib-core-tvm#use)

- cURL

```bash
curl -H "Authorization: ${AUTH}" "https://adobeio.adobeioruntime.net/apis/tvm/azure/blob/${NAMESPACE}"
```

## API

- Endpoints:
  - Get AWS S3 token: `https://adobeio.adobeioruntime.net/apis/tvm/aws/s3/${owNamespace}`
  - Get Azure Blob token: `https://adobeio.adobeioruntime.net/apis/tvm/azure/blob/${owNamespace}`
  - Get Azure Cosmos token: `https://adobeio.adobeioruntime.net/apis/tvm/azure/cosmos/${owNamespace}`

- For each of the above endpoints applies:
  - HTTP method is GET
  - OpenWhisk auth key must be passed in `Authorization` header
  - OpenWhisk namespace must be passed in the url path

- Deprecated:
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

- `npm install`

### Deployment Config

- `.env`:

  ```bash
  AIO_RUNTIME_APIVERSION=v1
  AIO_RUNTIME_APIHOST=https://adobeioruntime.net
  AIO_RUNTIME_NAMESPACE=mraho
  AIO_RUNTIME_AUTH=3bdc4815-bea0-4312-88c2-2f683867f9ca:qcv7NaqurDbuoGlC0iRaGvxqQCR5JhSUdZJ7g0Vw8MbMD2fOgWJpBuq9MZZ1EJVK

  EXPIRATION_DURATION=<token expiration in seconds>
  WHITELIST=<comma separated list of namespaces>

  AWS_ACCESS_KEY_ID=<key id of IAM user created in AWS>
  AWS_SECRET_ACCESS_KEY=<secret of IAM user created in AWS>
  S3_BUCKET=<MY_BUCKET>

  AZURE_STORAGE_ACCOUNT=<storage account name>
  AZURE_STORAGE_ACCESS_KEY=<storage access key>

  AZURE_COSMOS_ACCOUNT=<cosmosdb account name>
  AZURE_COSMOS_MASTER_KEY=<cosmosdb master key>
  AZURE_COSMOS_DATABASE_ID=<cosmosdb database name>
  AZURE_COSMOS_CONTAINER_ID=<cosmosdb database name>
  ```

- Use the `WHITELIST` variable to control which namespace can access the TVM and
  hence who can deploy files to your S3 Bucket.
  - **[ ⚠️ NOT RECOMMENDED ⚠️]** Use `WHITELIST=*` to allow access to
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

- Create a Bucket in S3 for your app
- Create an IAM user with the following IAM policy in AWS (replace `MY_BUCKET` with
  your app bucket name):

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
              "s3:ListBucket"
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

- `npm run deploy` will deploy all TVM endpoints to the OpenWhisk namespace configured in `.env`

### Undeploy

- `npm run undeploy`

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
