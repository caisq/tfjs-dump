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

async function runBaseLevelDirectory(inputPath, outputPath) {
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
    while (true) {
      try {
        await page.goto(`file://${__dirname}/puppeteer-convert.html`);
        const fileInput = await page.$('#fileInput');
        await fileInput.uploadFile(fileToUpload);
        await page.evaluate(() => doConversion());
        break;
      } catch (err) {
        // Detected freezing in the conversion process (should be rare).
        // Repeated retrying should resolve it.
      }
    }
    const results = await page.evaluate(() => collectConversionResults());
    const frameSize = 232;  // TODO(cais): DO NOT HARDCODE.
    const example = {
      label: '_dummy_label_',
      spectrogram: {data: new Float32Array(results.data), frameSize}
    }

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
      if (fs.existsSync(outputDir) && fs.lstatSync(outputDir).isFile()) {
        throw new Error(
            `Expected path to be nonexistent or a directory, ` +
            `but got a file: ${outputDir}`);
      }
      shelljs.mkdir('-p', outputDir);
      const outputPath = path.join(outputDir, `${dirItem}.bin`);
      console.log(`Processing data directory: ${fullPath}`);
      console.log(`  Writing to ${outputPath} ...`);
      await runBaseLevelDirectory(fullPath, outputPath);
    } else {
      await runNestedDirectory(
          fullPath, outputRoot, path.join(outputRelPath, dirItem));
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
    helps: 'Path to a .labels file. This flag must be used in case the ' +
        'input path is a single .wav file.'
  });
  const args = parser.parseArgs();

  if (fs.lstatSync(args.inputPath).isDirectory()) {
    // Assume the directory is the canonical data format.
    // TODO(cais): Call `python prep_wavs.py` via childprocess from here.
    //   Simplify the user workflow by saving that manual step.
    await runNestedDirectory(args.inputPath, args.outputPath);
  } else if (fs.statSync(args.inputPath).isFile()) {
    if (args.inputPath.endsWith('.wav')) {
      // Check that an accompanying .labels file exists.
      if (args.labelsPath == null) {
        throw new Error(
            '--labelsPath is not specified. It must be specified if ' +
            'inputPath is a .wav file.');
      }
      // Convert the .wav file to .dat format.
      console.log(`Converting ${args.inputPath} to .dat format...`);
      const datPath = await convertWavToDat(args.inputPath);
      console.log(`.dat file created at ${datPath}`);  // DEBUG
      // TODO(cais): Clean up .dat file.
    } else {
      throw new Error(
          `Unsupported extension name in input file. ` +
          `Currently supported formats are: .wav.`);
    }
  }
}

run();
