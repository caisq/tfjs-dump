import asyncio
import copy
import json
import os
import sys

from pygments import highlight
from pygments.lexers import PythonLexer
from pygments.formatters import HtmlFormatter

import IPython
from IPython import display
from ipykernel.comm import Comm
import tensorflow as tf
import queue
import threading

from IPython.core.magic import register_cell_magic


def _trace(message):
    with open('/tmp/dbg1.log', 'at') as f:
        f.write('%s\n' % message)


def _tensor_to_dtype_str(tensor):
    return repr(tensor.dtype).replace('tf.', '')


def _get_locals_summary(f_locals):
    # TODO(cais): Add unit tests.
    if not f_locals:
        return
    locals_summary = []
    for local_name in f_locals.keys():
        if local_name.startswith('__'):
            continue
        elif local_name in (
            '_ih', '_dh', '_oh', '_', '_i', '_ii', '_iii', '_i1', '_i2', '_i3'):
            continue

        value = f_locals[local_name]
        snapshot = None
        if isinstance(value, int):
            snapshot = '%d' % value
        elif isinstance(value, float):
            if abs(value) > 1e-2:
                snapshot = '%.3f' % value
            else:
                snapshot = '%.3e' % value
        elif isinstance(value, str):
            STR_LENGTH_LIM = 40
            if len(value) > STR_LENGTH_LIM:
                snapshot = '"' + value[: STR_LENGTH_LIM] + '...' + '"'
            else:
                snapshot = '"' + value + '"'

        is_tensor = isinstance(value, tf.Tensor)
        if is_tensor:
            dtype_str = _tensor_to_dtype_str(value)
            snapshot = '%s-%s' % (value.shape, dtype_str)

        locals_summary.append({
            'name': local_name,
            'type': str(type(value)),
            'snapshot': snapshot,
            'is_tensor': is_tensor
        })
    return locals_summary


class DebuggerCommHandler(object):

    def __init__(self):
        _trace('---- Initializing comm ----')  # DEBUG
        self.step_count = 0
        self.client_queue = queue.Queue()
        # TODO(cais): Remove.
        # self.message = 'Empty message'
        # Each element of the trace queue has the format:
        #     (frame_info, f_locals).
        self.trace_queue = queue.Queue(1)
        self.comm = None
        self.frame_message = None
        self.f_locals = None

    def target_func(self, comm, msg):
        self.comm = comm  # TODO(cais): Find out if it is safe.

        @comm.on_msg
        def _on_msg(msg):
            data = msg['content']['data']
            # _trace('data = %s' % json.dumps(data))  # DEBUG
            command = data['command']
            if command == 'step':
                if self.step_count == 0:
                    # Consume the initial debugger frame.
                    comm_handler.get_from_trace_queue_and_send_response()

                _trace('Received step command: step count = %d, calling get()' %
                       self.step_count)  # DEBUG
                self.step_count += 1
                self.client_queue.put('step')
                self.get_from_trace_queue_and_send_response()
            elif command == 'get_tensor_value':
                # TODO(cais): Better error handling.
                tensor_name = data['tensor_name']
                _trace('get_tensor_value: tenosr_name = %s' % tensor_name)
                tensor = self.f_locals[tensor_name]
                comm.send({
                    'name': tensor_name,
                    'dtype': _tensor_to_dtype_str(tensor),
                    'shape': tensor.shape.as_list(),
                    'values': tensor.numpy().tolist()
                })
                # TODO(cais): Need more efficient way of handling large tensors.
            else:
                raise Error('Unknown command %s' % data['command'])

        comm.send(debugger_data)

    def get_from_client_queue(self):
        return self.client_queue.get()

    def put_to_trace_queue(self, frame_message_and_f_locals):
        self.trace_queue.put(frame_message_and_f_locals)

    def get_from_trace_queue_and_send_response(self):
        (self.frame_message, self.f_locals) = self.trace_queue.get()
        _trace('get_from_trace_queue() returned')  # DEBUG
        if isinstance(self.frame_message, dict): # TODO(cais): Is this necessary?
            self.frame_message['step_count'] = self.step_count
        response_message = copy.copy(self.frame_message)
        locals_summary = _get_locals_summary(self.f_locals)
        response_message['locals_summary'] = locals_summary
        self.comm.send(response_message)

    # TODO(cais): Remove.
    # def set_message(self, message):
    #     self.message = message
    # def set_f_locals(self, f_locals):
    #     self.f_locals = f_locals


comm_handler = DebuggerCommHandler()
get_ipython().kernel.comm_manager.register_target(
    'debugger_comm_target', comm_handler.target_func)

debugger_data = {
    'code_lines': [],
    'code_html': None
}


def trace_function(frame, event, arg):
    with open('/tmp/debugger2.log', 'at') as f:
        f.write('%s - %s\n' % (frame.f_code.co_filename, frame.f_code.co_name))

    if frame.f_code.co_name == 'target_func':
        return None
    # elif (event == 'line' and
    elif frame.f_code.co_filename.startswith('<ipython-input-'):
        if event in ('call', 'return'):
            return trace_function
        else:
            sys.settrace(None)  # TODO(cais) Is this necessary?
            try:
                source_line = debugger_data['code_lines'][frame.f_lineno - 1]
            except:
                source_line = None
    #         message = '*** %s @ "%s" (%s: %s: Line %d)' % (
    #             event, source_line, frame.f_code.co_filename,
    #             frame.f_code.co_name, frame.f_lineno)
    #         print(message)

            frame_message = {
                'event': event,
                'source_line': source_line,
                'filename': frame.f_code.co_filename,
                'function_name': frame.f_code.co_name,
                'lineno': frame.f_lineno
            }
            _trace('Calling put_to_trace_queue()')  # DEBUG
            comm_handler.put_to_trace_queue((frame_message, frame.f_locals))
            # TODO(cais): Remove.
            # comm_handler.set_f_locals(frame.f_locals)

            _trace('Pausing: event=%s, lineno=%d' %
                (event, frame.f_lineno))  # DEBUG
            sys.settrace(trace_function)  # TODO(cais) Is this necessary?
            comm_handler.get_from_client_queue()
    #         input()
    #         sys.settrace(trace_function)

            return trace_function
    else:
        return None


class MyEventLoopPolicy(asyncio.DefaultEventLoopPolicy):

    def get_event_loop(self):
        loop = asyncio.new_event_loop()
        return loop


asyncio.set_event_loop_policy(MyEventLoopPolicy())


@register_cell_magic
def debugger_magic(line, cell):
    "my debugger jupyter magic"


    with open(os.path.join(os.path.dirname(__file__),
              'debugger.html'), 'rt') as f:
      debugger_html = f.read()
    display.display(display.HTML(debugger_html))
    display.display(display.Javascript(filename='dist/debugger_frontend.js'))

    revised_code = cell
    debugger_data['code_lines'] = cell.split('\n')

    # Use Pygment lexer and formatter
    code_html = highlight(
        cell, PythonLexer(),
        HtmlFormatter(lineno='inline', nowrap=True))
    debugger_data['code_html'] = code_html

    def thread_target():
        sys.settrace(trace_function)
        IPython.get_ipython().kernel.do_execute(revised_code, False, allow_stdin=True)
        sys.settrace(None)

    thread = threading.Thread(target=thread_target)
    thread.start()

    # Do not call join() or deadlock between comm.on_msg() and the traced
    # command will happen.
