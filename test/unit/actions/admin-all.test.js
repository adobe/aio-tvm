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
const adminAllAction = require('../../../actions/admin-all')

const { AdminTvm } = require('../../../lib/impl/AdminTvm')
jest.mock('../../../lib/impl/AdminTvm')

beforeEach(() => {
  AdminTvm.prototype.processRequest.mockReset()
})
test('admin-all action has a main function and calls AdminTvm.processRequest', async () => {
  const fakeParams = { a: { nested: 'param' }, another: 'param' }
  await adminAllAction.main(fakeParams)
  expect(AdminTvm.prototype.processRequest).toHaveBeenCalledWith(fakeParams)
})

test('admin-all action overwrites approvedList with its own namespace', async () => {
  process.env.__OW_NAMESPACE = 'test-env-namespace'
  const fakeParams = { approvedList: '' }
  const modifiedFakeParams = { approvedList: process.env.__OW_NAMESPACE }

  await adminAllAction.main(fakeParams)
  expect(AdminTvm.prototype.processRequest).toHaveBeenCalledWith(modifiedFakeParams)
})
