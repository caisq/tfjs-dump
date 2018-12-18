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

const argparse = require('argparse');
const childprocess = require('child_process');
const shelljs = require('shelljs');
const tempfile = require('tempfile');

const pup = require('puppeteer');
const speechCommands = require('@tensorflow-models/speech-commands');

/**
 * Run a single .dat file through the browser WebAudio conversion using
 * puppeteer.
 *
 * @param {string} inputFilePath The path to the .dat file object to upload.
 * @param {number} sampleFreqHz Sampling frequency of the .data file, in Hz.
 * @param {*} page The puppeteer page object to run the WebAudio conversion
 *   in.
 * @return Result of conversion.
 */
async function runFile(inputFilePath, sampleFreqHz, page) {
  let browser;
  if (page == null) {
    browser = await pup.launch();
    page = await browser.newPage();
  }
  console.log(`inputFilePath = ${inputFilePath}, sampleFreqHz = ${
      sampleFreqHz}`);  // DEBUG
  const lengthSec = getDatFileLengthSec(inputFilePath, sampleFreqHz);
  console.log(`lengthSec = ${lengthSec}`);  // DEBUG

  let result;
  while (true) {
    while (true) {
      try {
        await page.goto(`file://${__dirname}/puppeteer-convert.html`);
        const fileInput = await page.$('#fileInput');
        await fileInput.uploadFile(inputFilePath);
        const param = {sampleFreqHz, lengthSec: 4.0};  // DEBUG TODO(cais): Remove "5.1".
        // await page.evaluate((param) => setParam(param), param);
        await page.evaluate((param) => doConversion(param), param);
        
        // await page.evaluate(() => doConversion());
        break;
      } catch (err) {
        // Detected freezing in the conversion process (should be rare).
        // Repeated retrying should resolve it.

        // console.error(err);
        // // DEBUG
        // const result = await page.evaluate(() => collectConversionResults());
        // console.log(result.logText);  // DEBUG
        // break;   // TODO(cais): Remove. DEBUG.      
      }
    }

    result = await page.evaluate(() => collectConversionResults());
    if (result.completed) {
      // TODO(cais): Implement resumption.
      break;
    }
  }
  console.log('=========== LOG BEGINS =============');  // DEBUG
  console.log(result.logText);  // DEBUG
  console.log('=========== LOG ENDS =============');  // DEBUG
  if (browser != null) {
    browser.close();
  }
  return result;
}

/**
 * TODO(cais): Doc string.
 */
async function runBaseLevelDirectory(inputPath, outputPath, sampleFreqHz) {
  console.log(`runBaseLevelDirectory: ${inputPath}`);  // DEBUG
  // TODO(cais): Extract the label from the inputPath directly.

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

  const browser = await pup.launch();
  const page = await browser.newPage();
  const dataset = new speechCommands.Dataset();

  for (const fileToUpload of filesToUpload) {
    const result = await runFile(fileToUpload, sampleFreqHz, page);
    console.log(result)
    const frameSize = 232;  // TODO(cais): DO NOT HARDCODE.
    const example = {
      label: '_dummy_label_',
      spectrogram: {data: new Float32Array(result.data), frameSize}
    };
    dataset.addExample(example);
    console.log(
        `Added example with label "${example.label}": ` +
        `dataset.size() = ${dataset.size()}`);  // DEBUG
  }

  browser.close();

  const serializedDataset = dataset.serialize();
  fs.writeFileSync(outputPath, new Buffer(serializedDataset));
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

/**
 * Calculate the length of a .dat file.
 * @param {string} datFilePath Path to .dat file.
 * @param {number} sampleFreqHz Sampling frequency in Hz.
 * @returns {number} Legnth of the .dat file in s.
 */
function getDatFileLengthSec(datFilePath, sampleFreqHz) {
  const BYTES_PER_SAPMLE = 4;
  return fs.lstatSync(datFilePath).size / BYTES_PER_SAPMLE / sampleFreqHz;
}

async function runNestedDirectory(
    inputDir, outputRoot, sampleFreqHz, outputRelPath = '') {
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
      if (fs.existsSync(outputDir) && fs.lstatSync(outputDir).isFile()) {
        throw new Error(
            `Expected path to be nonexistent or a directory, ` +
            `but got a file: ${outputDir}`);
      }
      shelljs.mkdir('-p', outputDir);
      const outputPath = path.join(outputDir, `${dirItem}.bin`);
      console.log(`Processing data directory: ${fullPath}`);
      console.log(`  Writing to ${outputPath} ...`);
      await runBaseLevelDirectory(fullPath, outputPath, sampleFreqHz);
    } else {
      await runNestedDirectory(
          fullPath, outputRoot, sampleFreqHz,
          path.join(outputRelPath, dirItem));
    }
  }
}

async function convertWavToDat(wavPath, datPath) {
  if (datPath == null) {
    datPath = tempfile('.dat');
  }
  return new Promise((resolve, reject) => {
    const conversion = childprocess.spawn('./prep_wavs.py', [wavPath, datPath]);
    conversion.on('close', code => {
      console.log(`close with code: ${code}`);
      if (code === 0) {
        resolve(datPath);
      } else {
        reject();
      }
    });
  });
}

//** */
async function runWavWithLabels(wavPath,
                                labelsPath,
                                targetSampleFreqHz,
                                outputPath) {
  // Convert the .wav file to .dat format.
  console.log(`Converting ${wavPath} to .dat format...`);
  const datPath = await convertWavToDat(wavPath);
  console.log(`.dat file created at ${datPath}`);
  // TODO(cais): Clean up .dat file.

  const result = await runFile(datPath, targetSampleFreqHz);
  console.log(result.data.length);  // DEBUG

  const dataset = new speechCommands.Dataset();
  const frameSize = 232;  // TODO(cais): DO NOT HARDCODE.
  const example = {
    label: '_dummy_label_',
    spectrogram: {data: new Float32Array(result.data), frameSize}
  };
  dataset.addExample(example);

  console.log(`outputPath = ${outputPath}`);  // DEBUG
  fs.writeFileSync(outputPath, new Buffer(dataset.serialize()));
}

async function run() {
  const parser = new argparse.ArgumentParser(
      {description: 'Speech-commands converter based on puppeteer'});
  parser.addArgument('inputPath', {
    type: 'string',
    help: 'Input path. Can be a nested directory in the canonical directory ' +
        'structure or a single .wav file. In the case of a .wav file, it must ' +
        'be accompanied by a .labels file.'
  });
  parser.addArgument('outputPath', {type: 'string', help: 'Output path.'});
  parser.addArgument('--labelsPath', {
    type: 'string',
    help: 'Path to a .labels file. This flag must be used in case the ' +
        'input path is a single .wav file.'
  });
  parser.addArgument('--targetSampleFreqHz', {
    type: 'int',
    defaultValue: 44100,
    help: 'Target sampling frequency in Hz'
  });
  // TODO(cais): Add option for sampling frequency.
  const args = parser.parseArgs();

  if (fs.lstatSync(args.inputPath).isDirectory()) {
    // Assume the directory is the canonical data format.
    // TODO(cais): Call `python prep_wavs.py` via childprocess from here.
    //   Simplify the user workflow by saving that manual step.
    await runNestedDirectory(
        args.inputPath, args.outputPath, args.targetSampleFreqHz);
  } else if (fs.statSync(args.inputPath).isFile()) {
    if (args.inputPath.endsWith('.wav')) {
      // Check that an accompanying .labels file exists.
      if (args.labelsPath == null) {
        throw new Error(
            '--labelsPath is not specified. It must be specified if ' +
            'inputPath is a .wav file.');
      }
      
      await runWavWithLabels(
          args.inputPath, args.labelsPath, args.targetSampleFreqHz,
          args.outputPath);
    } else {
      throw new Error(
          `Unsupported extension name in input file. ` +
          `Currently supported formats are: .wav.`);
    }
  }
}

run();
