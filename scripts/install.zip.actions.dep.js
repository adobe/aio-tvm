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
const fs = require('fs')
const path = require('path')
const childProcess = require('child_process')
const yaml = require('js-yaml')

const rootDir = path.join(__dirname, '..')
const wskdeployFile = path.join(rootDir, 'wskdeploy.yml')
const wskdeployConfig = yaml.safeLoad(fs.readFileSync(wskdeployFile, 'utf8'))
const owPackage = 'tvm'

// sync
function installDep () {
  Object.entries(wskdeployConfig.packages[owPackage].actions).forEach(([name, action]) => {
    const actionPath = path.join(rootDir, action.function)
    if (fs.statSync(actionPath).isDirectory() &&
      fs.readdirSync(actionPath).includes('package.json')) {
      // npm install
      const install = childProcess.spawnSync(`npm`, ['install', '--no-package-lock'], { cwd: actionPath })
      if (install.error) throw install.error
      if (install.status !== 0) throw new Error(install.stderr.toString())
    }
  })
}

installDep()
