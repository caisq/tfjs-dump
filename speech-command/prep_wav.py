from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import glob
import math
import os
import struct

from scipy.io import wavfile
from scipy.signal import resample


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
    if os.path.isfile(parsed.output_data_path):
      raise ValueError(
          'If input_wav_path is a directory, '
          'output_data_path must also be a directory.')
    elif not os.path.exists(parsed.output_data_path):
      os.makedirs(parsed.output_data_path)

    input_wav_paths = (
        sorted(glob.glob(os.path.join(parsed.input_wav_path, '*.wav'))))
    for i, in_path in enumerate(input_wav_paths):
      subfolder = os.path.join(
          parsed.output_data_path,
          '%d' % int(math.floor(i / parsed.recordings_per_subfolder)))
      if not os.path.exists(subfolder):
        os.makedirs(subfolder)
      file_basename = os.path.basename(in_path)
      filename, extension_name = os.path.splitext(file_basename)
      output_basename = (
          filename + '.dat' if extension_name.lower() == '.wav' else filename)
      out_path = os.path.join(subfolder, output_basename)
      print('%s --> %s' % (in_path, out_path))
      converted_len = convert(
          in_path, parsed.target_fs, parsed.frame_size, out_path)
      if parsed.match_len is not None and parsed.match_len != converted_len:
        print('  Skipped %s due to length mismatch (%d != %d)' % (
            in_path, converted_len, parsed.match_len))
        os.remove(out_path)
  else:
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
