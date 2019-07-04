const azure = require('@azure/storage-blob')
const request = require('request-promise')
require('dotenv').config()

const blobPath = process.argv[2]
const content = process.argv[3]
const container = process.argv[4] || process.env.AIO_RUNTIME_NAMESPACE

const annonymousCredential = new azure.AnonymousCredential()
const pipeline = azure.StorageURL.newPipeline(annonymousCredential)

request(`https://adobeioruntime.net/api/v1/web/mraho/adobeio-cna-token-vending-machine-0.1.0/get-azure-blob-token?owAuth=${process.env.AIO_RUNTIME_AUTH}&owNamespace=${process.env.AIO_RUNTIME_NAMESPACE}`, { json: true })
  .then(async res => {
    const serviceURL = new azure.ServiceURL(res.sasURL, pipeline)

    const containerURL = azure.ContainerURL.fromServiceURL(serviceURL, container)
    const blockBlobURL = azure.BlockBlobURL.fromContainerURL(containerURL, blobPath)

    console.log(content)
    await blockBlobURL.upload(azure.Aborter.none, content, content.length)

    const files = await containerURL.listBlobFlatSegment(azure.Aborter.none, null)

    console.log(files)

    // await containerURL.delete(azure.Aborter.none)
  })
