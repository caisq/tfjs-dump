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
 * @param {number} tBeginSec Optional beginning time, in seconds.
 * @param {number} tEndSec Optional ending time, in seconds.
 * @return Result of conversion.
 */
async function runFile(inputFilePath,
                       sampleFreqHz,
                       nFFTIn,
                       page,
                       tBeginSec,
                       tEndSec) {
  let browser;
  if (page == null) {
    browser = await pup.launch();
    page = await browser.newPage();
  }
  const totalLengthSec = getDatFileLengthSec(inputFilePath, sampleFreqHz);
  // console.log(`datLengthSec = ${totalLengthSec}`);  // DEBUG

  if (tBeginSec == null) {
    tBeginSec = 0;
  }
  if (tEndSec == null) {
    tEndSec = totalLengthSec;
  }

  let data = [];
  let result;
  const frameSize = 232;  // TODO(cais): DO NOT HARD CODE.
  const frameDurationSec = nFFTIn / sampleFreqHz;
  const param = {
    sampleFreqHz,
    totalLengthSec,
    lengthSec: tEndSec - tBeginSec,  // TODO(cais): Use finalLength
    initFrameCount: Math.round(tBeginSec / frameDurationSec)
  };  // DEBUG TODO(cais): Remove hard coded lengthSec.
  while (true) {
    while (true) {
      try {
        await page.goto(`file://${__dirname}/puppeteer-convert.html`);
        const fileInput = await page.$('#fileInput');
        await fileInput.uploadFile(inputFilePath);
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
    if (result.data != null && result.data.length > 0) {
      data = data.concat(result.data);
    }
    if (result.completed) {
      // TODO(cais): Implement resumption. Deal with incomplete.
      // console.log(`Complete: frameCounter = ${result.frameCounter}`);  // DEBUG
      // console.log(`          ${result.data.length / frameSize}`);
      break;
    } else {
      // TODO(cais)
      console.log(`*** Incomplete: Resuming from ${result.frameCounter}`);
      // console.log(`    data.length = ${data.length}`);
      param.initFrameCount = result.frameCounter;
    }
  }
  // console.log('=========== LOG BEGINS =============');  // DEBUG
  // console.log(result.logText);  // DEBUG
  // console.log('=========== LOG ENDS =============');  // DEBUG
  if (browser != null) {
    browser.close();
  }
  // TODO(cais): It varies a little! Fix it.
  // console.log(`Final length: ${data.length / frameSize} frames`);
  return data;
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
    const nFFTIn = 1024;  // TODO(cais): DO NOT HARDCODE.
    const frameSize = 232;  // TODO(cais): DO NOT HARDCODE.
    const data = await runFile(fileToUpload, sampleFreqHz, nFFTIn, page);
    const example = {
      label: '_dummy_label_',
      spectrogram: {data: new Float32Array(data), frameSize}
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

/**
 * 
 * @param {*} labelsPath Path to the .labels file.
 */
function loadLabels(labelsPath) {
  const text = fs.readFileSync(labelsPath, 'utf-8');  // DEBUG
  const lines = text.split('\n');
  const events = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const items = [];
    trimmed.split(' ').forEach(x => {
      if (x.length > 0) {
        items.push(x);
      }
    });
    if (items.length !== 3) {
      throw new Error(`Cannot parse line in ${labelsPath}: "${line}"`);
    }
    const label = items[0];
    const tBeginSec = +items[1];
    const tEndSec = +items[2];
    if (tEndSec <= tBeginSec) {
      throw new Error(
          `tEnd is earlier than or equal to tBegin in: "${line}"`);
    }
    events.push({label, tBeginSec, tEndSec});
  }
  return events;
}

async function runWavWithLabels(wavPath,
                                labelsPath,
                                nFFTIn,
                                targetSampleFreqHz,
                                outputPath) {
  const events = loadLabels(labelsPath);
  console.log(events);  // DEBUG
  
  // Convert the .wav file to .dat format.
  console.log(`Converting ${wavPath} to .dat format...`);
  const datPath = await convertWavToDat(wavPath);
  console.log(`.dat file created at ${datPath}`);

  const frameSize = 232;  // TODO(cais): DO NOT HARDCODE.
  const numRequiredFrames = 43; // TODO(cais): DO NOT HARDCODE.

  const dataset = new speechCommands.Dataset();
  const frameDurationSec = nFFTIn / targetSampleFreqHz;
  let eventCount = 0;
  for (const event of events) {
    // const origFrame0 = Math.floor(event.tBeginSec / frameDurationSec);
    // const origFrame1 = Math.floor(event.tEndSec / frameDurationSec);
    // if (origFrame1 === origFrame0) {
    //   continue;
    // }
    for (const jitter of [-0.2, -0.1, 0, 0.1, 0.2]) {
      
      const t0 = event.tBeginSec + (event.tEndSec - event.tBeginSec) * jitter;
      const t1 = t0 + frameDurationSec * numRequiredFrames;
      console.log(
          `Label ${event.label}: jitter=${jitter}: ` +
          `t0=${t0.toFixed(3)}; t1=${t1.toFixed(3)}`);  // DEBUG
      // const frame0 =
      //     origFrame0 + Math.round((origFrame1 - origFrame0) * jitter);
      // let frame1 = frame0 + requiredNumFrames;

      const data =
          await runFile(datPath, targetSampleFreqHz, nFFTIn, null, t0, t1);
      console.log(
          `data.length=${data.length}; ` +
          `data #frames = ${data.length / frameSize}`);  // DEBUG
      
      // TODO(cais): Better logic for jitter.
      // if (frame1 - frame0 < requiredNumFrames) {
      //   frame1 = frame0 + requiredNumFrames;
      //   // TODO(cais): Add logic for temporal jitter.
      // } else if (frame1 - frame0 > requiredNumFrames) {
      //   throw new Error('Not Implemented yet')
      // }
      // const i0 = frame0 * frameSize;
      // const i1 = frame1 * frameSize;
  
      // if (i0 < 0 || i1 >= data.length) {
      //   console.warn(`WARNING: Skipping and event of label ${event.label}`);
      //   continue;
      // }
      // console.log(
      //   `Label ${event.label}: [${event.tBeginSec}, ${event.tEndSec}] ` +
      //   `--> [${i0}, ${i1}]`);
      const example = {
        label: event.label,
        spectrogram: {
          data: new Float32Array(data.slice(0, numRequiredFrames * frameSize)),  // TODO(cais): Fix.
          frameSize
        }
      };
      dataset.addExample(example);
    }
    eventCount++;
    // if (eventCount === 2) {
    //   break;  // DEBUG  
    // } 
  }

  // TODO(cais): Restore.
  // // Extract the _background_noise_ examples.
  // const noiseStrideSec = 0.5;
  // const noiseStrideFrames = Math.round(noiseStrideSec / frameDurationSec);
  // console.log(`noiseStrideFrames = ${noiseStrideFrames}`);  // DEBUG
  // let frame0 = 0;
  // while (true) {
  //   const frame1 = frame0 + requiredNumFrames;
  //   const t0 = frame0 * frameDurationSec;
  //   const t1 = frame1 * frameDurationSec;
  //   const i0 = frame0 * frameSize;
  //   const i1 = frame1 * frameSize;
  //   if (i1 >= data.length) {
  //     break;
  //   }
  //   // Determine if there is any overlap between the window and the events.
  //   let overlap = false;
  //   for (const event of events) {
  //     if (!(t1 < event.tBeginSec || t0 >= event.tEndSec)) {
  //       overlap = true;
  //       console.log('Skipping an overlap:', t0, t1);  // DEBUG
  //       frame0 = frame1;
  //       break;
  //     }
  //   }
  //   if (overlap) {
  //     continue;
  //   }
  //   const example = {
  //     label: '_background_noise_',  // TODO(cais): Do not hardcode.
  //     spectrogram: {
  //       data: new Float32Array(data.slice(i0, i1)),
  //       frameSize
  //     }
  //   };
  //   dataset.addExample(example);
  //   frame0 += noiseStrideFrames;
  // }

  console.log(`outputPath = ${outputPath}`);  // DEBUG
  fs.writeFileSync(outputPath, new Buffer(dataset.serialize()));

  // Clean up the temporary .dat file.
  fs.unlinkSync(datPath);
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
  parser.addArgument('--nFFTIn', {
    type: 'int',
    defaultValue: 1024,
    help: 'Target sampling frequency in Hz'
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
          args.inputPath, args.labelsPath, args.nFFTIn,
          args.targetSampleFreqHz, args.outputPath);
    } else {
      throw new Error(
          `Unsupported extension name in input file. ` +
          `Currently supported formats are: .wav.`);
    }
  }
}

run();
