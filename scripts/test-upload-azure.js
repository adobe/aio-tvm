const azure = require('@azure/storage-blob')

const container = process.argv[2]
const sasURL = process.argv[3]

const annonymousCredential = new azure.AnonymousCredential()
const pipeline = azure.StorageURL.newPipeline(annonymousCredential)
const serviceURL = new azure.ServiceURL(sasURL, pipeline)

const containerURL = azure.ContainerURL.fromServiceURL(serviceURL, container)
const blockBlobURL = azure.BlockBlobURL.fromContainerURL(containerURL, 'a/file.txt')

const content = 'some content'
blockBlobURL.upload(azure.Aborter.none, content, content.length).then(console.log)
