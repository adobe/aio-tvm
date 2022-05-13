const { objectPromise } = require('../../../actions/utils')

test('objectPromise returns resolved values in correct keys', async () => {
  const promise1 = new Promise((resolve, reject) => {
    resolve(1)
  })
  const promise2 = new Promise((resolve, reject) => {
    resolve(2)
  })

  const promiseObj = {
    p1: promise1,
    p2: promise2
  }

  const response = await objectPromise(promiseObj)

  expect(response.p1).toEqual(1)
  expect(response.p2).toEqual(2)
})
