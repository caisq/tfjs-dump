import sys
import time
import tensorflow as tf


tf.enable_eager_execution()


def trace_function(frame, event, arg):

  print('event = %s' % event)
  # print('stack:', frame.stack)
  # print(frame.f_exc_tracecback)
  print('%s: Line %d' % (frame.f_code.co_filename, frame.f_lineno))
  print('locals:', frame.f_locals)

  if '__file__' in globals() and frame.f_code.co_filename == __file__:
    raw_input()
    return trace_function
  else:
    return None


sys.settrace(trace_function)


def _add_one(x):
  out = x + 1
  return out


def main():
  a = tf.constant(3.14)
  x = 8
  y = 9
  v = [1, 2, 3, 4, 5, 6, 7]
  z = x + y
  z = _add_one(z)
  print(z)


main()