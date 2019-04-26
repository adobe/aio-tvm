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
const childProcess = require('child_process')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const wskdeployFile = path.join(rootDir, 'wskdeploy.yml')

function undeploy () {
  // load env variables
  require('dotenv').config({ path: path.join(rootDir, '.env') })
  // invoke wskdeploy command
  const wskdeploy = childProcess.spawnSync(
    `./wskdeploy`,
    [
      'undeploy',
      '--apihost', process.env['OW_APIHOST'],
      '--auth', process.env['OW_AUTH'],
      '--namespace', process.env['OW_NAMESPACE'],
      '-p', '.', '-m', wskdeployFile
    ],
    { cwd: rootDir, env: process.env }
  )

  if (wskdeploy.error) throw wskdeploy.error
  if (wskdeploy.status !== 0) throw new Error(wskdeploy.stderr.toString())

  console.log('Undeployment succeeded !')
}

undeploy()
