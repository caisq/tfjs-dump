from __future__ import division
from __future__ import print_function

import argparse
import os
import struct

from matplotlib import pyplot as plt
import numpy as np


def plot_spectrogram(input_file_name):
  with open(os.path.expanduser(input_file_name), 'rb') as f:
    buff = f.read()
    buffer_len = len(buff)
    num_floats = int(buffer_len / 4)
    print('num_floats = %s' % num_floats)
    data = np.array(struct.unpack('=%df' % num_floats, buff))
    print(data.shape)
    data = np.flipud(data.reshape([int(num_floats / 1024), 1024]).T[:360, :])

  fig = plt.figure()
  fig.add_subplot(111)
  plt.imshow(data, interpolation='bilinear', aspect='auto')
  print(plt.xlim())
  print(plt.ylim())

  plt.show()


if __name__ == '__main__':
  parser = argparse.ArgumentParser('Plot spectrogram.')
  parser.add_argument(
      'input_file_name', type=str,
      help='Path to input data file')
  parsed = parser.parse_args()

  plot_spectrogram(parsed.input_file_name)
