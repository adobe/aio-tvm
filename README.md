[![Build Status](https://travis-ci.com/adobe/adobeio-cna-token-vending-machine.svg?branch=master)](https://travis-ci.com/adobe/adobeio-cna-token-vending-machine)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)


# CNA Token Vending Machine for S3

This is an implementation of a TVM delivering **temporary tokens** to **push public
assets** to a **specific s3 bucket**. Users authenticate to the TVM with their
**OpenWhisk credentials** and are only authorized to upload files to their assigned
**s3 subfolder**. A **whitelist** controls who can access the TVM.

## TVM Usage Example

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

## Setup

- Download the latest wskdeploy binary (mac 64) to the root of the repo:

    ```bash
    curl -L https://github.com/apache/incubator-openwhisk-wskdeploy/releases/download/latest/openwhisk_wskdeploy-latest-mac-amd64.zip -o wskdeploy.zip && \
      mkdir -p tmp && \
      unzip wskdeploy.zip -d tmp && \
      cp tmp/wskdeploy . && \
      rm -rf tmp wskdeploy.zip
    ```

- `npm install`

## Deployment Config

- `.env`:

  ```
  OW_APIHOST=<openwhisk apihost>
  OW_NAMESPACE=<your OpenWhisk namespace>
  OW_AUTH=<your OpenWhisk auth>
  AWS_ACCESS_KEY_ID=<key id of IAM user created in AWS>
  AWS_SECRET_ACCESS_KEY=<secret of IAM user created in AWS>
  S3_BUCKET=<MY_BUCKET>
  EXPIRATION_DURATION=<token expiration in seconds, min & recommended is 900>
  WHITELIST=<comma separated list of namespaces>
  ```

- Use the `WHITELIST` variable to control which namespace can access the TVM and
  hence who can deploy files to your S3 Bucket.
  - **[ ⚠️ NOT RECOMMENDED ⚠️]** Use `WHITELIST=*` to allow access to
    **every** OpenWhisk namespace in the same domain.

## Deploy the TVM

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

- `npm run deploy` will deploy the web action to your namespace. The public
  url of your TVM will be shown in the console.

## Undeploy

- `npm run undeploy`

## Dev Tools

### Run Locally

- **TBD**, in the meantime you can use this [script](https://github.com/apache/incubator-openwhisk-devtools/tree/master/node-local)

### Unit Testing

- `npm run install-deps` to install the actions' dependencies (to do once before
  running tests)
- `npm run test` to run unit tests

### More Dev Commands

- `npm run lint` and `npm run beautify`
- `npm run coverage`
- `npm run clean`

## Contributing

Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing

This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.