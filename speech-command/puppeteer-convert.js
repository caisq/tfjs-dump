/**
 * @license
 * Copyright 2018 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const pup = require('puppeteer');

// Check input arguments.
if (process.argv.length !== 3) {
  console.log(`Usage:`);
  console.log(`    node ${__filename} <DAT_FILE_OR_DIR>`);
  process.exit(1);
}

async function run() {
  const inputPath = process.argv[2];
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Nonexistent path: ${inputPath}`);
  }
  const stat = fs.lstatSync(inputPath);
  const filesToUpload = [];
  if (stat.isDirectory()) {
    // List all the .dat files under the directory.
    const dirContent = fs.readdirSync(inputPath);
    for (const item of dirContent) {
      filesToUpload.push(path.join(inputPath, item));
    }
  } else {
    filesToUpload.push(inputPath);
  }
  console.log(`filesToUpload = ${filesToUpload}`);

  const browser = await pup.launch();
  const page = await browser.newPage();

  await page.goto(`file://${__dirname}/puppeteer-convert.html`);

  const fileInput = await page.$('#fileInput');
  console.log(`Uploading ${filesToUpload.length} dat files`);
  await fileInput.uploadFile(...filesToUpload);
  const convertButton = await page.$('#convert');
  await convertButton.click();

  const intervalJob = setInterval(async () => {
    const numRecordings = await page.evaluate(() => queryRecordingCounter());
    // const output = await page.evaluate(() => collectConversionResults());
    // console.log(`numRecordings = ${numRecordings}`);  // DEBUG
    // console.log(output.logText);
    if (numRecordings === 1) {
      clearInterval(intervalJob);
      const output = await page.evaluate(() => collectConversionResults());
      // console.log(output.logText);
      console.log(`'--- Data: ---`);
      console.log(`numRecordings = ${output.numRecordings}`);
      console.log(output.data.length);
      fs.writeFileSync('data.json', JSON.stringify(output.data));
      browser.close();
    }
  }, 500);

  // setTimeout(async () => {
  //   

  //   
  //   
  //   // await page.pdf({
  //   //   path: 'test.pdf',
  //   //   format: 'A4',
  //   //   margin: {
  //   //     top: "20px",
  //   //     left: "20px",
  //   //     right: "20px",
  //   //     bottom: "20px"
  //   //   }
  //   // });
  // }, 20);

//   await page.evaluate(() => {
//     const button = document.getElementById('fooButton');
//     console.log(button);  // DEBUG
//   });

  
}

run();