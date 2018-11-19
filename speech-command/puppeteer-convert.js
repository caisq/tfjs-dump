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
const shelljs = require('shelljs');

const pup = require('puppeteer');

// Check input arguments.
if (process.argv.length !== 4) {
  console.log(`Usage:`);
  console.log(`    node ${__filename} <INPUT_ROOT> <OUTPUT_ROOT>`);
  process.exit(1);
}

function writeSpectrogramToFileStream(fileStream, spectrogram) {
  spectrogram.forEach((x, i) => {
    if (x == null) {
      spectrogram[i] = NaN;
    }
  });
  const data = new Float32Array(spectrogram);
  const buffer = new Buffer(data.length * 4);
  for (let i = 0; i < data.length; ++i) {
    buffer.writeFloatLE(data[i], i * 4);
  }
  fileStream.write(buffer);
}

async function runBaseLevelDirectory(inputPath, outputPath) {
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
  filesToUpload.sort();

  if (fs.existsSync(outputPath) && fs.lstatSync(outputPath).isDirectory()) {
    throw new Error(
        `Expected output path to be nonexistent or a file, ` +
        `but got a directory: ${outputPath}`);
  }
  const outputStream = fs.createWriteStream(outputPath);

  const browser = await pup.launch();
  const page = await browser.newPage();

  for (const fileToUpload of filesToUpload) {
    await page.goto(`file://${__dirname}/puppeteer-convert.html`);
    const fileInput = await page.$('#fileInput');
    await fileInput.uploadFile(fileToUpload);
    while (true) {
      try {
        await page.evaluate(() => doConversion());
        break;
      } catch (err) {
        // Detected freezing in the conversion process (should be rare).
        // Repeated retrying should resolve it.
      }
    }
    const results = await page.evaluate(() => collectConversionResults());
    writeSpectrogramToFileStream(outputStream, results.data);
    // console.log(`Processed ${fileToUpload} (length = ${results.data.length})`);
    // const dataJsonFileName = `data_${path.basename(fileToUpload)}.json`;
    // console.log(`  --> ${dataJsonFileName}`);  // DEBUG
    // fs.writeFileSync(dataJsonFileName, JSON.stringify(results.data));
  }

  browser.close();
  outputStream.end();
}

function isBaseLevelDirectory(dirPath) {
  const dirContent = fs.readdirSync(dirPath);
  for (const dirItem of dirContent) {
    const fullPath = path.join(dirPath, dirItem);
    if (fs.lstatSync(fullPath).isDirectory()) {
      return false;
    }
  }
  return true;
}

async function runNestedDirectory(inputDir, outputRoot, outputRelPath = '') {
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Nonexistent input path: ${inputDir}`);
  }
  if (!fs.lstatSync(inputDir).isDirectory()) {
    throw new Error(
        `Expected input path (${inputDir}) to be a directory, ` + 
        `but it is a file.`);
  }

  const dirContent = fs.readdirSync(inputDir);
  for (const dirItem of dirContent) {
    const fullPath = path.join(inputDir, dirItem);
    const isBaseLevel = isBaseLevelDirectory(fullPath);
    if (isBaseLevel) {
      const outputDir = path.join(outputRoot, outputRelPath);
      console.log('Creating directory: ' + outputDir);
      if (fs.existsSync(outputDir) && fs.lstatSync(outputDir).isFile()) {
        throw new Error(
            `Expected path to be nonexistent or a directory, ` + 
            `but got a file: ${outputDir}`);
      }
      shelljs.mkdir('-p', outputDir);
      const outputPath = path.join(outputDir, `${dirItem}.dat`);
      console.log(`Processing data directory: ${fullPath}`);
      console.log(`  Writing to ${outputPath} ...`);    
      await runBaseLevelDirectory(fullPath, outputPath);
    } else {
      await runNestedDirectory(fullPath, outputRoot, path.join(outputRelPath, dirItem));
    }
  }
}

async function run() {  
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  await runNestedDirectory(inputPath, outputPath);
}

run();
