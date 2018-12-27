#!/usr/bin/env python
# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
# ==============================================================================

# from __future__ import absolute_import
# from __future__ import division
# from __future__ import print_function

import argparse
import glob
import math
import os
import struct

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample


_BACKGROUND_NOISE_DIR = '_background_noise_'


def read_as_floats(wav_path):
  '''Read a wav file as a numpy float array.

  Asserts that the wav file has only one channel.
  Asserts that the wav file has int16 data type.

  Args:
    wav_path: Path to the wav file to read.

  Returns:
    fs: sampling frequency
    signal: signal as a float32-type numpy array of shape [signalLength].
  '''
  fs, signal = wavfile.read(wav_path)
  assert len(signal.shape) == 1
  assert signal.dtype == np.int16
  signal = signal.astype('float32')
  signal = signal / 32768.0
  return fs, signal


def read_and_resample_as_floats(wav_path, target_fs):
  '''Read audio signal from wav file and resample it to target frequency.

  Args:
    wav_path: Path to the wav file.
    target_fs: Target sampling frequency.

  Returns:
    Resampled signal.
  '''
  fs, signal = read_as_floats(wav_path)
  num_samples = signal.shape[0]
  target_num_samples = int(math.floor(num_samples * target_fs / fs))

  if len(signal) != target_num_samples:
    resampled_x = resample(signal, target_num_samples).astype('float32')
  else:
    resampled_x = signal.astype('float32')
  return resampled_x


def generate_noise_examples(noise_wav_path,
                            num_noise_examples,
                            recordings_per_subfolder,
                            target_fs,
                            sample_length,
                            noise_out_dir,
                            file_begin_index=0):
  '''Load examples from a raw noise .wav file.

  Args:
    noise_wav_path: Path to the raw noise .wav file.
    num_noise_examples: Number of noise examples to extract from the .wav file.
    recordings_per_subfolder: Number of .dat files per output subfolder.
    target_fs: Target sampling frequency in Hz.
    sample_length: Length (in number of PCM samples) per example.
    noise_out_dir: Output directory for noise examples.
    file_begin_index: Begin naming output files at.
  '''
  print('noise_wav_path = %s; num_noise_examples = %s' %
        (noise_wav_path, num_noise_examples))
  print('Reading %s...' % noise_wav_path)
  fs, signal = read_as_floats(noise_wav_path)
  fs_multiplier = target_fs / fs
  sample_length_0 = int(np.ceil(sample_length / fs_multiplier))
  max_begin_index = len(signal) - sample_length_0

  begin_indices = np.random.randint(0, max_begin_index, num_noise_examples)
  for i, begin_index in enumerate(begin_indices):
    subfolder = os.path.join(
        noise_out_dir,
        '%d' % int(math.floor(
            (i + file_begin_index) / recordings_per_subfolder)))
    if not os.path.isdir(subfolder):
      os.makedirs(subfolder)

    out_data_path = os.path.join(subfolder, '%.5d.dat' % (i + file_begin_index))
    if os.path.exists(out_data_path):
      raise ValueError('File already exists: %s' % out_data_path)
    waveform = signal[begin_index : begin_index + sample_length_0]
    resampled_waveform = resample(waveform, sample_length)

    with open(out_data_path, 'wb') as out_file:
      out_file.write(struct.pack(
          'f' * len(resampled_waveform), *resampled_waveform))


def load_and_normalize_waveform(wav_path, target_fs, frame_size):
  '''Load and normalize waveform from a wav file.

  The waveform is truncated so it contain an integer multiple of `frame_size`
  samples.

  Args:
    wav_path: Path to the wav file.
    target_fs: Target sampling frequency.
    frame_size: Frame size in # of samples (at target_fs).

  Return:
    Loaded and truncated waveform.
  '''
  signal = read_and_resample_as_floats(wav_path, target_fs)
  num_frames = int(len(signal) / frame_size)
  if num_frames == 0:
    raise ValueError(
        'Encountered an wav file which will be 0 samples long if truncated: '
        '%s' % wav_path)
  return signal[:frame_size * num_frames]


def get_filling_snippet(x, fill_len, fill_type):
  # Constant filling snippet length. Arbitrarily selected.
  fill_snippet_len_min = 2000
  fill_snippet_len_max = 5000  
  fill = np.zeros([0])
  if not (fill_type in ('head', 'tail')):
    raise ValueError('Unrecognized fill_type: %s' % fill_type)
  while len(fill) < fill_len:
    increment = int(np.random.randint(
        fill_snippet_len_min, fill_snippet_len_max, [1])[0])
    if increment + len(fill) > fill_len:
      increment = fill_len - len(fill)
    if fill_type == 'head':
      fill = np.concatenate([x[:increment], fill])
    else:
      fill = np.concatenate([fill, x[len(x) - increment:]])
  return fill


def convert(in_wav_path,
            target_fs,
            frame_size,
            out_data_path,
            match_len=None,
            multi_splits=False,
            do_filling=True):
  '''Convert an input wav file to an output data file.

  The data file consists of the resampled and truncated PCM samples.

  Args:
    in_wav_path: Input wav file path.
    target_fs: Target sampling frequency.
    frame_size: Frame size in # of samples. The waveform will be
      truncated to an integer multiple length of `frame_size`.
    out_data_path: Output data file path. In the case of
      `multi_splits == True`, it is used as the path prefix and
      suffix such as '_split1' and '_split2" will be added.
    match_len: Expected output length in number of audio samples.
    multi_splits: Perform multiple splits. For example if the input
      waveform has a length of 10k and `match_len` equals 4k, then
      three output wavefiles will be generate, with starting sample
      indices of 0, 4k and 6k, respetively.
    do_filling: Whether to perform filling for input waveforms
      shorter than match_len.

  Returns:
    Length (in # of samples) of the waveform in the file at
      `out_data_path`.
  '''
  # print('convert(): out_data_path = %s' % out_data_path)  # DEBUG
  waveform = load_and_normalize_waveform(in_wav_path,
                                         target_fs,
                                         frame_size)
  out_waveforms = []
  # print('match_len = %s' % match_len)  # DEBUG
  if match_len is None:
    # Extract the entire waveform from the single .wav file.
    out_waveforms.append(waveform)
  else:
    # print(len(waveform))  # DEBUG
    if len(waveform) > match_len:
      if not multi_splits:
        out_waveforms.append(waveform[:match_len])
      else:
        num_splits = int(np.ceil(len(waveform) / float(match_len)))
        for split in range(num_splits):
          start_index = match_len * split
          end_index = match_len * (split + 1)
          if end_index > len(waveform):
            end_index = len(waveform)
            start_index = end_index - match_len
          print('Split %d of %d: %s: %d --> %d' %
                (split + 1, num_splits, in_wav_path, start_index, end_index))
          out_waveforms.append(waveform[start_index : end_index])

    elif len(waveform) < match_len and do_filling:
      orig_len = len(waveform)
      len_diff = match_len - orig_len
      head_len = int(np.floor(len_diff / 2))
      tail_len = len_diff - head_len
      if head_len > 0:
        waveform = np.concatenate([
          get_filling_snippet(waveform, head_len, 'head'), waveform])
      if tail_len > 0:
        waveform = np.concatenate([
            waveform, get_filling_snippet(waveform, tail_len, 'tail')])
      assert len(waveform) == match_len, 'Length mismatch after filling'
      print('Filling: %s: (head=%d; tail=%d) %s --> %s' %
            (in_wav_path, head_len, tail_len, orig_len, match_len))
      out_waveforms.append(waveform)

    else:
      # I.e., len(waveform) == match_len
      out_waveforms.append(waveform)

  out_file_paths = []
  if len(out_waveforms) == 1:
    # print('out_waveforms len == 1')  # DEBUG
    out_file_paths.append(out_data_path)
  else:
    file_name, ext_name = os.path.splitext(out_data_path)
    for i in range(len(out_waveforms)):
      out_file_paths.append('%s_split%d%s' % (file_name, i, ext_name))
  # print('out_file_paths = %s' % out_file_paths)  # DEBUG

  for out_path, out_waveform in zip(out_file_paths, out_waveforms):
    with open(out_path, 'wb') as out_file:
      out_file.write(struct.pack('f' * len(out_waveform), *out_waveform))

  return len(out_waveforms[0]) if out_waveforms else -1


def convert_wav_files_in_dir(input_dir,
                             output_dir,
                             recordings_per_subfolder,
                             target_fs,
                             frame_size,
                             match_len=None,
                             test_split=None,
                             test_output_dir=None,
                             convert_wav_files_in_dir=False,
                             multi_splits=False,
                             do_filling=True):
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
    convert_wav_files_in_dir: Whether a single input file is to be split into
      multiple output ones if it is long enough. For example, suppose each
      output sample is 40k samples long and a input sample is 100k samples
      long, then the three output samples will be generates, starting at]
      indices 0, 40k, and 60k, respectively. The last indices is selected so
      as to avoid going over the edge.
    multi_splits: Perform multiple splits. For example if the input
      waveform has a length of 10k and `match_len` equals 4k, then
      three output wavefiles will be generate, with starting sample
      indices of 0, 4k and 6k, respetively.
    do_filling: Whether to perform filling on input waveforms shorter than
      match_len.

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
      converted_len = convert(
          in_path, target_fs, frame_size, out_path, match_len=match_len,
          multi_splits=multi_splits, do_filling=do_filling)
      if (match_len is not None and match_len != converted_len
          and os.path.exists(out_path)):
        print('  Skipped %s due to length mismatch (%d != %d)' % (
            in_path, converted_len, match_len))
        os.remove(out_path)
      if n == 0:
        num_train_examples += 1
      else:
        num_test_examples += 1

  return num_train_examples, num_test_examples


def main():
  if os.path.isdir(FLAGS.input_wav_path):
    nums_train_examples = []
    nums_test_examples = []
    if FLAGS.words is None:
      raise ValueError('missing words argument.')
    words = FLAGS.words.strip().split(',')
    words = [word.strip() for word in words]
    print('words = %s' % (words,))
    if len(set(words)) != len(words):
      raise ValueError('Found duplicate items in words: %s' % FLAGS.words)

    # Make sure that all unknown words belong to words.
    unknown_words = []
    if FLAGS.unknown_words:
      unknown_words = [w for w in FLAGS.unknown_words.split(',') if w]
      if len(set(unknown_words)) != len(unknown_words):
        raise ValueError(
            'Found duplicate items in unknown_words: %s' % FLAGS.unknown_words)
      print('unknown words = %s' % (unknown_words,))
      for unknown_word in unknown_words:
        if unknown_word in words:
          raise ValueError(
              'Unknown word "%s" overlaps with words' % unknown_word)
      words = words + unknown_words
      print('All words (including uknown words) = %s' % (words,))

    # Make sure that all the subfolders exist under `input_wav_path`.
    for word in words:
      word_dir = os.path.join(FLAGS.input_wav_path, word)
      if not os.path.isdir(word_dir):
        raise ValueError('Missing word directory: %s' % word_dir)

    assert FLAGS.test_split > 0.0 and FLAGS.test_split < 1.0
    print('Using test split: %f' % FLAGS.test_split)
    print('Number of words: %d' % len(words))

    if not os.path.isdir(FLAGS.output_data_path):
      os.makedirs(FLAGS.output_data_path)

    train_base = os.path.join(FLAGS.output_data_path, 'train')
    test_base = os.path.join(FLAGS.output_data_path, 'test')
    if os.path.isdir(train_base) or os.path.isdir(test_base):
      raise ValueError('train or test subdirectory already exists.')
    os.makedirs(train_base)
    os.makedirs(test_base)

    for word in words:
      word_input_dir = os.path.join(FLAGS.input_wav_path, word)
      train_out_dir = os.path.join(
          train_base, '_unknown_' if word in unknown_words else word)
      test_out_dir = os.path.join(
          test_base, '_unknown_' if word in unknown_words else word)

      multi_splits = ((word == _BACKGROUND_NOISE_DIR) or
                      FLAGS.all_words_multi_splits)
      if multi_splits:
        print('*** Will use multiple splits for word "%s" ***' % word)

      num_train_examples, num_test_examples = convert_wav_files_in_dir(
          word_input_dir, train_out_dir,
          FLAGS.recordings_per_subfolder, FLAGS.target_fs,
          FLAGS.frame_size, FLAGS.match_len,
          FLAGS.test_split, test_out_dir,
          multi_splits=multi_splits,
          do_filling=(not FLAGS.no_filling))
      nums_train_examples.append(num_train_examples)
      nums_test_examples.append(num_test_examples)
  elif os.path.isfile(FLAGS.input_wav_path):
    convert(FLAGS.input_wav_path,
            FLAGS.target_fs,
            FLAGS.frame_size,
            FLAGS.output_data_path)
    print('Processed input wav file')  # DEBUG
  else:
    raise ValueError('Nonexistent input path %s' % FLAGS.input_wav_path)


  if FLAGS.include_noise:
    # Generate noise examples.
    num_train_noise_examples = int(np.round(np.mean(nums_train_examples)))
    num_test_noise_examples = int(np.round(np.mean(nums_test_examples)))
    print('num_train_noise_examples = %d; num_test_noise_examples = %d' % (
        num_train_noise_examples, num_test_noise_examples))
    raw_noise_wav_paths = sorted(glob.glob(
        os.path.join(FLAGS.input_wav_path, _BACKGROUND_NOISE_DIR, '*.wav')))
    for split in ('train', 'test'):
      if split == 'train':
        num_examples = num_train_noise_examples
      else:
        num_examples = num_test_noise_examples
      num_examples //= len(raw_noise_wav_paths)
      begin_file_index = 0
      for raw_noise_wav_path in raw_noise_wav_paths:
        out_dir = os.path.join(
            FLAGS.output_data_path, split, _BACKGROUND_NOISE_DIR)
        if not os.path.isdir(out_dir):
          os.makedirs(out_dir)
        generate_noise_examples(
            raw_noise_wav_path, num_examples, FLAGS.recordings_per_subfolder,
            FLAGS.target_fs, FLAGS.match_len, out_dir,
            file_begin_index=begin_file_index)
        begin_file_index += num_examples


if __name__ == '__main__':
  parser = argparse.ArgumentParser(
      'Preparation of speech command data. This is the first step '
      'in preparing the audio data for training a tensorflow.js audio '
      'model that utilizes the web browser''s native WebAudio FFT.')
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
      '--unknown_words', type=str,
      help='Words to lump into the _unknown_ category, seperated by commas. '
      'This must be non-overlapping with --words.')
  parser.add_argument(
      '--include_noise', action='store_true',
      help='Include examples of background noise in the data. These '
      'samples are extracted from the long .wav file recordings of '
      'various kinds of background noises inside the _background_noise_ '
      'directory. N.B., these noise samples are separate examples, and _not_ '
      'additive noises to the word examples.')
  parser.add_argument(
      '--test_split', type=float, default=0.15,
      help='The fraction of files to split out for testing. Must be a '
      'number between 0 and 1. Applicable only if --words is set. '
      'The files are split randomly into the training and test subsets.')
  parser.add_argument(
      '--target_fs', type=float, default=44100,
      help='Target sampling frqeuency in Hz in the output data files.'
      'The input signals in the .wav files will be resampled.'
      'This should match the sampling frequency of AudioContexts in '
      'the browser.')
  parser.add_argument(
      '--frame_size', type=int, default=1024,
      help='Frame size at target frequency.')
  parser.add_argument(
      '--recordings_per_subfolder', type=int, default=300,
      help='Number of recordings to store in every subfolder under '
      '`output_data_path`.')
  parser.add_argument(
      '--match_len', type=int, default=44032,
      help='Keep only recordings with exactly `match_length` samples.')
  parser.add_argument(
      '--no_filling', action='store_true',
      help='Do NOT use filling for input waveforms shorter than match_len')
  parser.add_argument(
      '--all_words_multi_splits', action='store_true',
      help='Use multi-splits on all words (not just _background_noise_)')
  FLAGS, _ = parser.parse_known_args()

  main()
