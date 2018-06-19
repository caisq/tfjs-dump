"""Generate binary files of various sizes.

The files contain random binary data.
"""

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import os
import random
import string


def _generate_random_string(length):
  """Generate a random ASCII string.

  Args:
    length: Length of the string (in bytes).

  Returns:
    A random ASCII string.
  """
  pool = string.ascii_uppercase + string.ascii_lowercase + string.digits
  return b''.join(random.choice(pool) for _ in range(length))


def _gen_files(output_dir, file_sizes_kb):
  """Generate files of given sizes and write them to given directory.

  Args:
    output_dir: Output directory. If it does not exist, it will be created.
    file_sizes_kb: File sizes in kilobytes, as a `list` of `int`s.
  """
  if not os.path.isdir(output_dir):
    os.makedirs(output_dir)

  for size_kb in file_sizes_kb:
    file_path = os.path.join(output_dir, '%d-kb' % size_kb)
    with open(file_path, 'wb') as f:
      f.write(_generate_random_string(size_kb * 1024))


if __name__ == '__main__':
  parser = argparse.ArgumentParser(
      'Generate random binary files of specified sizes.')
  parser.add_argument(
      'output_dir', type=str,
      help='Output directory')
  parser.add_argument(
      '--file_sizes_kb', type=str,
      default='1,2,5,8,10,20,50,80,100,200,500,800,1000,2000,3000,4000,'
      '5000,6000,7000,8000,9000,10000',
      help='File sizes in kilobytes, seperated with comma')

  parsed = parser.parse_args()

  file_sizes_kb = [
      int(size.strip()) for size in parsed.file_sizes_kb.strip().split(',')]
  _gen_files(parsed.output_dir, file_sizes_kb)
