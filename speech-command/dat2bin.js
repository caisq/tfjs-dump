/**
 * Convert a legacy .dat directory into a .bin (TFJSSCDS) directory.
 */

const fs = require('fs');
const path = require('path');

const argparse = require('argparse');
const shelljs = require('shelljs');
const speechCommands = require('@tensorflow-models/speech-commands');

function processDatFile(datPath, binPath, label, frameSize, numFrames) {
  const buffer = fs.readFileSync(datPath);
  const data = new Float32Array(buffer.buffer);

  let iBegin = 0;
  let iEnd = iBegin + frameSize;
  let spectrogramData = [];
  let waitingForNextSpectrogram = false;
  const dataset = new speechCommands.Dataset();
  while (iEnd <= data.length) {
    iEnd = iBegin + frameSize;

    if (Number.isFinite(data[iBegin])) {
      spectrogramData.push(...data.slice(iBegin, iEnd));
      if (waitingForNextSpectrogram) {
        waitingForNextSpectrogram = false;
      }
    } else {
      // data[iBegin] is infinity or NaN.
      if (!waitingForNextSpectrogram) {
        waitingForNextSpectrogram = true;
        // console.log(
        //     `New spectrogram: iBegin = ${iBegin}; ` +
        //     `${spectrogramData.length / frameSize}`);  // DEBUG
        if (spectrogramData.length >= frameSize * numFrames) {
          spectrogramData = spectrogramData.slice(0, frameSize * numFrames);
        //   console.log(`After slice(): spectrogramData.length = ${spectrogramData.length}`);  // DEBUG
          const example = {
            label,
            spectrogram: {data: new Float32Array(spectrogramData), frameSize}
          };
          dataset.addExample(example);
        }
        spectrogramData = [];
      }
    }
    iBegin += frameSize;
  }
//   console.log(`dataset size: ${dataset.size()}`);  // DEBUG

  const dirname = path.dirname(binPath);
  if (!fs.existsSync(dirname)) {
    shelljs.mkdir('-p', dirname);
  }
  console.log(
        `${binPath} --> ${binPath}: label=${label}; ` +
        `dataset size: ${dataset.size()}`);  // DEBUG
  fs.writeFileSync(binPath, new Buffer(dataset.serialize()));
}

function processDirectory(inputPath, outputPath, frameSize, numFrames) {
  const items = fs.readdirSync(inputPath);
  for (const item of items) {
    const fullInputPath = path.join(inputPath, item);
    const fullOutputPath = path.join(outputPath, item);
    if (fs.lstatSync(fullInputPath).isDirectory()) {
    //   console.log(`Recursive cal: ${fullInputPath} --> ${fullOutputPath}`);  // DEBUG
      processDirectory(fullInputPath, fullOutputPath, frameSize, numFrames);
    } else {
      const label = path.basename(inputPath);
    //   console.log(`inputPath = ${inputPath}, label = ${label}`);  // DEBUG
      processDatFile(
          fullInputPath, fullOutputPath, label, frameSize, numFrames);
    }
  }
}

function parseArguments() {
  const parser = new argparse.ArgumentParser({
    description:
        'Convert a legacy .dat data directory into a .bin data directory'
  });
  parser.addArgument(
      'inputDatPath', {type: 'string', help: 'Input .dat directory'});
  parser.addArgument(
      'outputBinPath', {type: 'string', help: 'Output .bin path.'});
  parser.addArgument('--numFrames', {
    type: 'int',
    defaultValue: 43,
    help: 'Required number of frames per spectrogram'
  });
  parser.addArgument('--frameSize', {
    type: 'int',
    defaultValue: 232,
    help: 'Required number of FFT points per frame'
  });

  // TODO(cais): Add option for sampling frequency.
  return parser.parseArgs();
}

async function main() {
  const args = parseArguments();

  // Check to make sure that output path is nonexistent.
  if (fs.existsSync(args.outputBinPath)) {
    throw new Error(`Path already exists: ${args.outputBinPath}`);
  }

  processDirectory(
      args.inputDatPath, args.outputBinPath, args.frameSize, args.numFrames);

  //   processDatFile(
  //       '/usr/local/google/home/cais/ml-data/speech_commands_browser_clean/train/zero/0.dat',
  //       'zero', args.frameSize);  // TODO(cais): DO NOT HARDCODE.
}

main();