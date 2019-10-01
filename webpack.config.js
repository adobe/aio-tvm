const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')

const actions = yaml.safeLoad(fs.readFileSync('manifest.yml', 'utf8')).packages.__CNA_PACKAGE__.actions

module.exports = Object.keys(actions).map(a => {
  const action = actions[a]
  return {
    entry: [
      path.join(__dirname, action.function)
    ],
    output: {
      path: path.join(__dirname, 'dist', 'actions'),
      filename: a + '.js',
      library: a,
      libraryTarget: 'commonjs2'
    },
    mode: 'production',
    target: 'node',
    optimization: {
      // error on minification for azure/blob endpoint (`Expected signal to be an instanceof AbortSignal`)=> fix this
      minimize: false
    },
    // the following lines are used to require es6 module, e.g.node-fetch which is used by azure sdk
    resolve: {
      extensions: ['.js'],
      mainFields: ['main']
    },
    stats: {
      warningsFilter: "Module not found: Error: Can't resolve 'encoding'"
    }
  }
})
