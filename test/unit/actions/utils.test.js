const { objectPromise } = require('../../../actions/utils')

test('objectPromise returns resolved values in correct keys', async () => {
    let promise1 = new Promise((resolve, reject) => {
        resolve(1)
    }); 
    let promise2 = new Promise((resolve, reject) => {
        resolve(2)
    }); 

    let promiseObj = {
        p1: promise1, 
        p2: promise2
    }

    let response = await objectPromise(promiseObj)

    expect(response.p1).toEqual(1)
    expect(response.p2).toEqual(2)
})