import sys
import time
import tensorflow as tf


tf.enable_eager_execution()


current_stack = []


def trace_function(frame, event, arg):

  if event == 'call':
    current_stack.append(frame.f_code.co_name)
  elif event == 'return':
    current_stack.pop()

  if '__file__' in globals() and frame.f_code.co_filename == __file__:
    print(current_stack)  # DEBUG
    print('%s @ %s (%s): Line %d' %
          (event, frame.f_code.co_filename, frame.f_code.co_name,
           frame.f_lineno))
    # if frame.f_trace:
    #   sys.settrace(None)
    #   print(frame.f_trace(frame, event, arg))
    #   sys.settrace(trace_function)
    print('locals:', frame.f_locals.keys())
    input()
    return trace_function
  else:
    if event == 'call':
      current_stack.pop()
    return


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


sys.settrace(trace_function)

main()