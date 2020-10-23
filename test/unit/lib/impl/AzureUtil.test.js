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

const azureUtil = require('../../../../lib/impl/AzureUtil')

const fetch = require('node-fetch')
jest.mock('node-fetch', () => jest.fn())
const fakeResponse = jest.fn()

const fakeAccount = 'fakeAccount'
const fakeKey = 'fakeKey'
const fakeAccessPolicy = '<?xml version="1.0" encoding="utf-8"?><SignedIdentifiers><SignedIdentifier><Id>fakepolicy</Id><permissions></permissions></SignedIdentifier></SignedIdentifiers>'
const fakeEmptyAccessPolicy = '<?xml version="1.0" encoding="utf-8"?><SignedIdentifiers></SignedIdentifiers>'
const fakeEmptyAccessPolicy1 = '<?xml version="1.0" encoding="utf-8"?>'

const mockSetAccessPolicy = jest.fn()
const mockAzureContainerURL = {
  url: 'https://fakeAccount/fake',
  setAccessPolicy: mockSetAccessPolicy
}

describe('AzureUtil tests', () => {
  fetch.mockResolvedValue({
    text: fakeResponse
  })

  beforeEach(async () => {
    fakeResponse.mockResolvedValue(fakeAccessPolicy)
    mockSetAccessPolicy.mockReset()
  })
  describe('getAccessPolicy', () => {
    test('getAccessPolicy valid policy', async () => {
      const ret = await azureUtil.getAccessPolicy(mockAzureContainerURL, fakeAccount, fakeKey)
      expect(ret).toBe('fakepolicy')
    })

    test('getAccessPolicy empty policy', async () => {
      fakeResponse.mockResolvedValue(fakeEmptyAccessPolicy)
      const ret = await azureUtil.getAccessPolicy(mockAzureContainerURL, fakeAccount, fakeKey)
      expect(ret).toBe(undefined)
    })

    test('getAccessPolicy empty api response', async () => {
      fakeResponse.mockResolvedValue(fakeEmptyAccessPolicy1)
      const ret = await azureUtil.getAccessPolicy(mockAzureContainerURL, fakeAccount, fakeKey)
      expect(ret).toBe(undefined)
    })
  })

  describe('setAccessPolicy', () => {
    test('setAccessPolicy valid policy', async () => {
      await azureUtil.setAccessPolicy(mockAzureContainerURL)
      expect(mockSetAccessPolicy).toHaveBeenCalledTimes(1)
    })
  })

  describe('addAccessPolicyIfNotExists', () => {
    test('addAccessPolicyIfNotExists policy exists', async () => {
      await azureUtil.addAccessPolicyIfNotExists(mockAzureContainerURL, fakeAccount, fakeKey)
      expect(mockSetAccessPolicy).toHaveBeenCalledTimes(0)
    })

    test('addAccessPolicyIfNotExists policy does not exists', async () => {
      fakeResponse.mockResolvedValue(fakeEmptyAccessPolicy)
      await azureUtil.addAccessPolicyIfNotExists(mockAzureContainerURL, fakeAccount, fakeKey)
      expect(mockSetAccessPolicy).toHaveBeenCalledTimes(1)
    })
  })
})
