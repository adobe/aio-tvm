/**
 * PromiseAll replacement for an object with key-values of promises. Returns promise
 * data with the appropriate key name.
 *
 * @param {object} obj Key-value promises to resolve
 * @returns {object} Resolved promises with values assigned to original promise keys
 */
function objectPromise (obj) {
  return Promise.all(
    Object
      .keys(obj)
      .map(key => Promise.resolve(obj[key]).then(val => ({ key: key, val: val })))
  ).then(items => {
    const result = {}
    items.forEach(item => { result[item.key] = item.val })
    return result
  })
}

module.exports = {
  objectPromise
}
