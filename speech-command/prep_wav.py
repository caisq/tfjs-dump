from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import glob
import math
import os
import struct

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample


_BACKGROUND_NOISE_DIR = '_background_noise_'


def read_wav_as_floats(wav_path, target_fs):
  '''Read audio signal from wav file and resample it to target frequency.

  Args:
    wav_path: Path to the wav file.
    target_fs: Target sampling frequency.

  Returns:
    Resampled signal.
  '''
  fs, signal = wavfile.read(wav_path)

  assert len(signal.shape) == 1
  num_samples = signal.shape[0]
  target_num_samples = int(math.floor(num_samples * target_fs / fs))
  resampled_x = resample(signal, target_num_samples)

  return resampled_x


def generate_noise_examples(noise_wav_path,
                            num_examples,
                            recordings_per_subfolder,
                            target_fs,
                            sample_length,
                            out_dir,
                            begin_file_index=0):
  '''Load examples from a raw noise .wav file.

  Args:
    noise_wav_path: Path to the raw noise .wav file.
    num_examples: Number of examples to extract from the .wav file.
    recordings_per_subfolder: Number of .dat files per output subfolder.
    target_fs: Target sampling frequency in Hz.
    sample_length: Length (in number of PCM samples) per example.
    out_dir: Output directory.
    begin_file_index: Begin naming output files at.
  '''
  print('In generate_noise_examples')
  print('noise_wav_path = %s; num_examples = %s' %
        (noise_wav_path, num_examples))
  print('Reading %s...' % noise_wav_path)
  # samples = read_wav_as_floats(noise_wav_path, target_fs)
  fs, signal = wavfile.read(noise_wav_path)
  fs_multiplier = target_fs / fs
  sample_length_0 = int(np.ceil(sample_length / fs_multiplier))
  max_begin_index = len(signal) - sample_length_0

  begin_indices = np.random.randint(0, max_begin_index, num_examples)
  for i, begin_index in enumerate(begin_indices):
    subfolder = os.path.join(
        out_dir,
        '%d' % int(math.floor(
            (i + begin_file_index) / recordings_per_subfolder)))
    if not os.path.isdir(subfolder):
      os.makedirs(subfolder)

    out_data_path = os.path.join(subfolder, '%.5d.dat' % (i + begin_file_index))
    waveform = signal[begin_index : begin_index + sample_length_0]
    resampled_waveform = resample(waveform, sample_length)
    with open(out_data_path, 'wb') as out_file:
      out_file.write(struct.pack(
          'f' * len(resampled_waveform), *resampled_waveform))
    print('--> %s' % out_data_path)


def load_and_normalize_waveform(wav_path, target_fs, frame_size):
  '''Load and normalize waveform from a wav file.

  The waveform is truncated so it contain an integer multiple of `frame_size`
  samples.

  Args:
    wav_path: Path to the wav file.
    target_fs: Target sampling frequency.
    frame_size: Frame size in # of samples.

  Return:
    Loaded and truncated waveform.
  '''
  signal = read_wav_as_floats(wav_path, target_fs)
  num_frames = int(len(signal) / frame_size)
  if num_frames == 0:
    raise ValueError(
        'Encountered an wav file which will be 0 samples long if truncated: '
        '%s' % wav_path)
  return signal[:frame_size * num_frames]


def convert(in_wav_path, target_fs, frame_size, out_data_path):
  '''Convert an input wav file to an output data file.

  The data file consists of the resampled and truncated PCM samples.

  Args:
    in_wav_path: Input wav file path.
    target_fs: Target sampling frequency.
    frame_size: Frame size in # of samples. The waveform will be
      truncated to an integer multiple length of `frame_size`.
    out_data_path: Output data file path.

  Returns:
    Length (in # of samples) of the waveform in the file at
      `out_data_path`.
  '''
  waveform = load_and_normalize_waveform(in_wav_path,
                                         target_fs,
                                         frame_size)
  with open(out_data_path, 'wb') as out_file:
    out_file.write(struct.pack('f' * len(waveform), *waveform))
  return len(waveform)


def convert_wav_files_in_dir(input_dir,
                             output_dir,
                             recordings_per_subfolder,
                             target_fs,
                             frame_size,
                             match_len=None,
                             test_split=None,
                             test_output_dir=None):
  '''Convert wav files from input directory and write results output dir.

  Args:
    input_dir: Input directory.
    output_dir: Output directory.
    recordings_per_subfolder: Number of recordings to put in every subdirectory
      under input_dir.
    target_fs: Target sampling frequency.
    frame_size: Frame size.
    match_len: Only output the recordings with the exact length (optional).
    test_split: Fraction of wav files from input_dir to go into test_output_dir
      as test data. If specified, test_output_dir must also be specified, else
      a ValueError will be thrown. Must be a number between 0.0 and 1.0.
    test_output_dir: Output directory for test data.

  Returns:
    - The number of training examples.
    - The number of test examples.
  '''
  if os.path.isfile(output_dir):
    raise ValueError(
        'If input_wav_path is a directory, '
        'output_data_path must also be a directory.')
  elif not os.path.exists(output_dir):
    os.makedirs(output_dir)

  if test_split is not None:
    assert test_split > 0.0 and test_split < 1.0
    if test_output_dir is None:
      raise ValueError(
          'test_output_dir must be specified if test_split is specified.')
    if not os.path.isdir(test_output_dir):
      os.makedirs(test_output_dir)

  in_wav_paths = sorted(glob.glob(os.path.join(input_dir, '*.wav')))
  if not in_wav_paths:
    raise ValueError('Cannot find any .wav files in %s' % input_dir)

  if test_split is None:
    train_wav_paths = in_wav_paths
    test_wav_paths = []
  else:
    indices = np.arange(len(in_wav_paths))
    np.random.shuffle(indices)
    num_train = int(np.round((1.0 - test_split) * len(in_wav_paths)))
    train_wav_paths = [in_wav_paths[i] for i in indices[:num_train]]
    test_wav_paths = [in_wav_paths[i] for i in indices[num_train:]]

  num_train_examples = 0
  num_test_examples = 0
  for n in range(2):
    if n == 0:
      split_in_path = train_wav_paths
      split_out_path = output_dir
    else:
      if test_split is None:
        break
      split_in_path = test_wav_paths
      split_out_path = test_output_dir

    for i, in_path in enumerate(split_in_path):
      subfolder = os.path.join(
          split_out_path,
          '%d' % int(math.floor(i / recordings_per_subfolder)))
      if not os.path.exists(subfolder):
        os.makedirs(subfolder)
      file_basename = os.path.basename(in_path)
      filename, extension_name = os.path.splitext(file_basename)
      output_basename = (
          filename + '.dat' if extension_name.lower() == '.wav' else filename)
      out_path = os.path.join(subfolder, output_basename)
      print('%s --> %s' % (in_path, out_path))
      converted_len = convert(
          in_path, target_fs, frame_size, out_path)
      if match_len is not None and match_len != converted_len:
        print('  Skipped %s due to length mismatch (%d != %d)' % (
            in_path, converted_len, match_len))
        os.remove(out_path)
      if n == 0:
        num_train_examples += 1
      else:
        num_test_examples += 1

  return num_train_examples, num_test_examples


if __name__ == '__main__':
  parser = argparse.ArgumentParser('Preparation of speech command data.')
  parser.add_argument(
      'input_wav_path', type=str,
      help='Path to a directory in which a number of .wav files reside.')
  parser.add_argument(
      'output_data_path', type=str,
      help='Path to a directory in which the converted data files will be '
      'be written')
  parser.add_argument(
      '--words', type=str,
      help='Words to get from `output_data_path`, seperated by commas. '
      'It is assumes that subdirectories with the same names as the words '
      'exist under `output_data_path`. No dupicates are allowed.')
  parser.add_argument(
      '--include_noise', action='store_true',
      help='Include samples of silence in the data.')
  parser.add_argument(
      '--test_split', type=float, default=0.15,
      help='The fraction of files to split out for testing. Must be a '
      'number between 0 and 1. Applicable only if --words is set. '
      'The files are split randomly into the training and test subsets.')
  parser.add_argument(
      '--target_fs', type=float, default='44100',
      help='Target sampling frqeuency in Hz in the output data files.'
      'The input signals in the .wav files will be resampled.')
  parser.add_argument(
      '--frame_size', type=int, default='1024',
      help='Frame size at target frequency.')
  parser.add_argument(
      '--recordings_per_subfolder', type=int, default=500,
      help='Number of recordings to store in every subfolder under '
      '`output_data_path`.')
  parser.add_argument(
      '--match_len', type=int, default=44032,
      help='Keep only recordings with exactly `match_length` samples.')
  parsed, _ = parser.parse_known_args()

  xs = []
  if os.path.isdir(parsed.input_wav_path):
    nums_train_examples = []
    nums_test_examples = []
    if parsed.words is None:
      num_train_examples, num_test_examples = convert_wav_files_in_dir(
          parsed.input_wav_path, parsed.output_data_path,
          parsed.recordings_per_subfolder, parsed.target_fs,
          parsed.frame_size, parsed.match_len)
      nums_train_examples.append(num_train_examples)
      nums_test_examples.append(num_test_examples)
    else:
      words = parsed.words.strip().split(',')
      words = [word.strip() for word in words]
      print(words)
      if len(set(words)) != len(words):
        raise ValueError('Found duplicate items in words: %s' % parsed.words)

      # Make sure that all the subfolders exist under `input_wav_path`.
      for word in words:
        word_dir = os.path.join(parsed.input_wav_path, word)
        if not os.path.isdir(word_dir):
          raise ValueError('Missing word directory: %s' % word_dir)

      assert parsed.test_split > 0.0 and parsed.test_split < 1.0
      print('Using test split: %f' % parsed.test_split)
      print('Number of words: %d' % len(words))

      if not os.path.isdir(parsed.output_data_path):
        os.makedirs(parsed.output_data_path)

      train_base = os.path.join(parsed.output_data_path, 'train')
      test_base = os.path.join(parsed.output_data_path, 'test')
      if os.path.isdir(train_base) or os.path.isdir(test_base):
        raise ValueError('train or test subdirectory already exists.')
      os.makedirs(train_base)
      os.makedirs(test_base)

      for word in words:
        word_input_dir = os.path.join(parsed.input_wav_path, word)
        train_out_dir = os.path.join(train_base, word)
        test_out_dir = os.path.join(test_base, word)
        num_train_examples, num_test_examples = convert_wav_files_in_dir(
            word_input_dir, train_out_dir,
            parsed.recordings_per_subfolder, parsed.target_fs,
            parsed.frame_size, parsed.match_len,
            parsed.test_split, test_out_dir)
        nums_train_examples.append(num_train_examples)
        nums_test_examples.append(num_test_examples)

    if parsed.include_noise:
      # Generate noise examples.
      num_train_noise_examples = int(np.round(np.mean(nums_train_examples)))
      num_test_noise_examples = int(np.round(np.mean(nums_test_examples)))
      print('num_train_noise_examples = %d; num_test_noise_examples = %d' % (
          num_train_noise_examples, num_test_noise_examples))
      raw_noise_wav_paths = sorted(glob.glob(
          os.path.join(parsed.input_wav_path, _BACKGROUND_NOISE_DIR, '*.wav')))
      for split in ('train', 'test'):
        if split == 'train':
          num_examples = num_train_noise_examples
        else:
          num_examples = num_test_noise_examples
        num_examples //= len(raw_noise_wav_paths)
        begin_file_index = 0
        for raw_noise_wav_path in raw_noise_wav_paths:
          out_dir = os.path.join(
              parsed.output_data_path, split, _BACKGROUND_NOISE_DIR)
          if not os.path.isdir(out_dir):
            os.makedirs(out_dir)
          generate_noise_examples(
              raw_noise_wav_path, num_examples, parsed.recordings_per_subfolder,
              parsed.target_fs, parsed.match_len, out_dir,
              begin_file_index=begin_file_index)
          begin_file_index += num_examples
  else:
    if parsed.include_noise:
      raise ValueError(
          '--include_noise should be used only with input_wav_path '
          'as a directory.')

    input_wav_paths = parsed.input_wav_path.split(',')

    xs = []
    for input_wav_path in input_wav_paths:
      print('Loading from %s' % input_wav_path)
      x = load_and_normalize_waveform(input_wav_path,
                                      parsed.target_fs,
                                      parsed.frame_size)
      xs.extend(x)

    with open(parsed.output_data_path, 'wb') as f:
      f.write(struct.pack('f' * len(xs), *xs))

