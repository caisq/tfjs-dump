import asyncio
import json
import os
import sys

import IPython
from IPython import display
from ipykernel.comm import Comm
import tensorflow as tf
import queue
import threading

from IPython.core.magic import register_cell_magic


class DebuggerCommHandler(object):

    def __init__(self):
        self.step_count = 0
        self.queue = queue.Queue()
        self.message = 'Empty message'

    def target_func(self, comm, msg):
        @comm.on_msg
        def _on_msg(msg):
            data = msg['content']['data']
            with open('/tmp/dbg1.log', 'at') as f:
                f.write('data = %s\n' % json.dumps(data))  # DEBUG
            if data['command'] == 'step':
                self.step_count += 1
                self.queue.put('step')
                if isinstance(self.message, dict):
                    self.message['step_count'] = self.step_count
                comm.send(self.message)
            elif data['command'] == 'get_local_names':
                with open('/tmp/dbg1.log', 'at') as f:
                  f.write('Local names = %s\n' % json.dumps(list(self.f_locals.keys())))  # DEBUG
                comm.send({'local_names': list(self.f_locals.keys())})

        comm.send({
            'code_lines': debugger_data['code_lines']
        })

    def get_from_queue(self):
        return self.queue.get()

    def set_message(self, message):
        self.message = message

    def set_f_locals(self, f_locals):
        self.f_locals = f_locals


comm_handler = DebuggerCommHandler()
get_ipython().kernel.comm_manager.register_target(
    'debugger_comm_target', comm_handler.target_func)


debugger_data = {
    'code_lines': []
}


def trace_function(frame, event, arg):
    with open('/tmp/debugger2.log', 'at') as f:
        f.write('%s - %s\n' % (frame.f_code.co_filename, frame.f_code.co_name))

    if frame.f_code.co_name == 'target_func':
        return None
    elif frame.f_code.co_filename.startswith('<ipython-input-'):
        try:
            source_line = debugger_data['code_lines'][frame.f_lineno - 1]
        except:
            source_line = None
#         message = '*** %s @ "%s" (%s: %s: Line %d)' % (
#             event, source_line, frame.f_code.co_filename,
#             frame.f_code.co_name, frame.f_lineno)
#         print(message)
        comm_handler.set_message({
            'event': event,
            'source_line': source_line,
            'filename': frame.f_code.co_filename,
            'function_name': frame.f_code.co_name,
            'lineno': frame.f_lineno
        })
        comm_handler.set_f_locals(frame.f_locals)

#         sys.settrace(None)
#         print('Calling get_fromt_queue()')  # DEBUG
        comm_handler.get_from_queue()
#         input()
#         print('DONE Calling get_fromt_queue()')  # DEBUG
#         sys.settrace(trace_function)

#             comm_handler.get_from_queue()

#             print('DONE Calling get_fromt_queue()')  # DEBUG
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

    def thread_target():
        sys.settrace(trace_function)
        IPython.get_ipython().kernel.do_execute(revised_code, False, allow_stdin=True)
        sys.settrace(None)

    thread = threading.Thread(target=thread_target)
    thread.start()
    # Do not call join() or deadlock between comm.on_msg() and the traced
    # command will happen.
