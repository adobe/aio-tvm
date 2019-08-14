[![Build Status](https://travis-ci.com/adobe/adobeio-cna-token-vending-machine.svg?branch=master)](https://travis-ci.com/adobe/adobeio-cna-token-vending-machine)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

# Adobe I/O CNA Token Vending Machine (TVM)

This is an implementation of a TVM delivering **temporary and restricted tokens** to access various cloud services. Users authenticate
to the TVM with their **Adobe I/O Runtime (a.k.a OpenWhisk) credentials** and are only authorized to access their resources.

## Supported Cloud Services

- **AWS S3**
  - *Accessible to Adobe I/O Runtime users at `https://adobeio.adobeioruntime.net/apis/tvm/aws/s3` (POST)*
  - *the old endpoint `https://adobeioruntime.net/api/v1/web/adobeio/tvm/get-s3-upload-token` is still accessible (POST and GET)*
- **Azure Blob Storage**
  - *Accessible to Adobe I/O Runtime users at `https://adobeio.adobeioruntime.net/apis/tvm/azure/blob` (POST)`*

## Parameters

- When sending a request to a TVM endpoint the following query or body parameters are required:

```json
{"owAuth": "<myauth>", "owNamespace": "<mynamespace>"}
```

- The namespace can also be passed in the path i.e: `https://adobeio.adobeioruntime.net/apis/tvm/azure/blob/{namespace}`

## TVM Usage Example (AWS S3)

- The following code snippet illustrates how users can retrieve and use tokens from the
TVM to upload a public asset to their s3 folder in your app bucket:

  ```js
  const request = require('request-promise')
  const aws = require('aws-sdk')
  const fs = require('fs-extra')
  const path = require('path')

  const TVM_URL = '<url_to_deployed_tvm>'
  const FILE_TO_UPLOAD='index.html'
  const OW_AUTH = '<user_ow_auth>'
  const OW_NAMESPACE = '<user_ow_namespace>'

  // request credentials
  const creds = await request(TVM_URL, {
    json: {
      owAuth: OW_AUTH,
      owNamespace: OW_NAMESPACE
    }
  })

  // instantiate s3 client
  const s3 = new aws.S3(creds)

  // upload file
  const uploadParams = {
    // only allowed to access namespace subfolder
    Key: path.join(OW_NAMESPACE, FILE_TO_UPLOAD),
    Body: await fs.readFile(FILE_TO_UPLOAD),
    ACL: 'public-read',
    ContentType: 'text/html'
  }
  await s3.upload(uploadParams).promise()
  ```

- Response body sample:

  ```json
  {
    "accessKeyId": "...",
    "expiration": "1970-01-01T00:00:00.000Z",
    "params": {
      "Bucket": "adobe-cna"
    },
    "secretAccessKey": "...",
    "sessionToken": "..."
  }
  ```

## Deploy your own TVM

### Why

You want to share a cloud service that you own (e.g 1 S3 account) with a set of OpenWhisk namespaces and you want to
make sure that each namespace has access only to the resources they own (e.g can only see their S3 blobs).

This might be useful for you if:

- You have multiple Adobe I/O Runtime namespaces and you need them to access a cloud service but you don't want to use
  the one exposed by Adobe's TVM
- You are an OpenWhisk provider and want to provide an easy access to an external cloud service (e.g. storage)

### Setup

- install the `aio` CLI and `aio cna` plugin

  ```bash
  npm install -g @adobe/aio-cli
  aio plugins install @adobe/aio-cli-plugin-cna
  ```

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
  ```

- Use the `WHITELIST` variable to control which namespace can access the TVM and
  hence who can deploy files to your S3 Bucket.
  - **[ ⚠️ NOT RECOMMENDED ⚠️]** Use `WHITELIST=*` to allow access to
    **every** OpenWhisk namespace in the same domain.

### Configure account credentials for Azure Blob

- **TODO: doc**

### Configure account credentials for AWS S3

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

- `aio cna deploy -av` will deploy all TVM endpoints to the OpenWhisk namespace configured in `.env`

### Undeploy

- `aio cna undeploy -av`

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
