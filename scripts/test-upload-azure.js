#!/usr/bin/env node
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

const azure = require('@azure/storage-blob')
const request = require('request-promise')
require('dotenv').config()

const blobPath = process.argv[2] || 'hellofile'
const content = process.argv[3] || 'hello'

const annonymousCredential = new azure.AnonymousCredential()
const pipeline = azure.StorageURL.newPipeline(annonymousCredential)
request.post(`https://${process.env.AIO_RUNTIME_NAMESPACE}.adobeioruntime.net/apis/tvm/azure/blob?owAuth=${process.env.AIO_RUNTIME_AUTH}&owNamespace=${process.env.AIO_RUNTIME_NAMESPACE}`, { json: true })
  .then(async res => {
    console.log(res)
    const containerURL = new azure.ContainerURL(res.sasURLPrivate, pipeline)
    const blockBlobURL = azure.BlockBlobURL.fromContainerURL(containerURL, blobPath)

    let files = (await containerURL.listBlobFlatSegment(azure.Aborter.none, null)).segment.blobItems.map(f => f.name)

    console.log(files)
    await blockBlobURL.upload(azure.Aborter.none, content, content.length)

    files = (await containerURL.listBlobFlatSegment(azure.Aborter.none, null)).segment.blobItems.map(f => f.name)

    console.log(files)

    await containerURL.delete(azure.Aborter.none)
  }).catch(console.error)
