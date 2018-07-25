from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import glob
import os
import struct

from matplotlib import pyplot as plt
import numpy as np


NUM_FRAMES_CUTOFF = 43
VALID_FRAME_COUNT_RANGE = [5, 50]


def sanity_check_spectrogram(spec):
  if np.any(np.isnan(spec)) or np.any(np.isinf(spec)):
    return False
  elif spec.shape[1] < NUM_FRAMES_CUTOFF:
    return False
  else:
    return True


def normalize(spec):
  return (spec - np.mean(spec)) / np.std(spec)


def to_one_hot(labels, unique_labels):
  out = np.zeros([len(labels), len(unique_labels)], dtype=np.float32)
  for i, label in enumerate(labels):
    out[i, label] = 1.0
  return out


def load_spectrograms(dat_path,
                      label,
                      unique_labels,
                      n_fft):
  '''
  Load spectrograms from a .dat file.

  It is assumed that all the examples in the .dat file have the same label.

  Args:
    dat_path: Path to the .dat file.
    label: Label for all the examples in the .dat file.
    unique_labels: All unique labels in the entire dataset, i.e., the dataset
      of which `dat_path` is a part.
    n_fft: Number of FFT points for each time slice. This corresponds to
      half the sampling frequency.

  Returns:
    A `list` of 2D numpy arrays.
  '''
  print('dat_path = %s' % dat_path)
  specs = []
  spec_lengths = []
  labels = []
  with open(dat_path, 'rb') as f:
    buffer = f.read()
    buffer_len = len(buffer)
    num_floats = int(buffer_len / 4)

    data = np.array(struct.unpack('=%df' % num_floats, buffer))
    data = data.reshape([int(num_floats / n_fft), n_fft]).T

  num_discarded = 0
  num_kept = 0
  t = 0
  while t < data.shape[1]:
    t_begin = t
    t_end = t + 1
    while (t_end < data.shape[1] and
           (not np.isinf(data[0, t_end]) and data[0, t_end] != 0.0)):
      t_end += 1
    if t_end >= data.shape[1]:
      break
    # print('t_begin = %d, t_end = %d' % (t_begin, t_end))

    spec = data[:, t_begin : t_end]
    frame_count = t_end - t_begin
    if (frame_count < VALID_FRAME_COUNT_RANGE[0] or
        frame_count > VALID_FRAME_COUNT_RANGE[1]):
      print('WARNING: Invalid frame count: %d' % frame_count)
    if not sanity_check_spectrogram(spec):
      # plt.imshow(np.flipud(spec), interpolation='bilinear', aspect='auto')
      # plt.show()
      # print(spec.shape)
      num_discarded += 1
    else:
      spec = spec[:, :NUM_FRAMES_CUTOFF]

      specs.append(normalize(spec))
      spec_lengths.append(spec.shape[1])
      labels.append(label)
      num_kept += 1

    t = t_end + 1
    while t < data.shape[1] and (np.isinf(data[0, t]) or data[0, t] == 0.0):
      t += 1
    if t >= data.shape[1]:
      break
  print('  Kept: %d; Discarded: %d' % (num_kept, num_discarded))
  # print('  Length min: %d, max: %d' % (np.min(spec_lengths), np.max(spec_lengths)))
  specs = np.expand_dims(np.swapaxes(np.array(specs, dtype=np.float32), 1, 2), -1)
  return specs, to_one_hot(labels, unique_labels)


def load_data(root_dir, n_fft):
  '''Load data from a directory.

  Args:
    root_dir: Root directory of data. Under the directory, it is assumed
      that subdirectories with names matching individual words can be found.
      It is further assumed that in each subdirectory, there are one or more
      .dat files.
    n_fft: Number of FFT points for each time slice. This corresponds to
      half the sampling frequency.

  Returns:
    - Unique word labels as a `list` of `str`s.
    - `xs`: numpy array for the input features, of shape
      `[num_examples, time_steps, freq_steps, 1]`.
    - `ys`: numpy array for the one-hot encoded labels, of shape
      `[numExamples, num_classes]`.
  '''
  xs = None
  ys = None

  unique_labels = sorted([
      os.path.basename(path) for path in glob.glob(os.path.join(root_dir, '*'))
      if os.path.isdir(path)])
  print('Unique labels (count = %d) = %s' %
        (len(unique_labels), unique_labels))

  for i, label in enumerate(unique_labels):
    label_dir = os.path.join(root_dir, label)
    dat_paths = sorted(glob.glob(os.path.join(label_dir, '*.dat')))
    for dat_path in dat_paths:
      print('Loading spectrograms from %s' % dat_path)
      file_xs, file_ys = load_spectrograms(dat_path, i, unique_labels, n_fft)
      assert(file_xs.shape[0] == file_ys.shape[0])
      if xs is None:
        xs = file_xs
        ys = file_ys
      else:
        xs = np.concatenate([xs, file_xs], 0)
        ys = np.concatenate([ys, file_ys], 0)
      # plt.imshow(spec, interpolation='bilinear', aspect='auto')
      # plt.show()
  print(xs.shape)
  print(ys.shape)

  # Randomly shuffle the data.
  num_examples = xs.shape[0]
  order = np.array(range(num_examples), dtype=np.int32)
  np.random.shuffle(order)

  xs = xs[order, :,  :]
  ys = ys[order, :]
  return unique_labels, xs, ys
